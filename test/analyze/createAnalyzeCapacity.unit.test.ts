/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import {
  createAnalyzeCapacity,
  parseStatCsv
} from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import {
  capacityBenchmarkResultSchema,
  type CapacityBenchmarkResult
} from "../../src/schemas/index.js";
import {
  capacityConfig,
  type CapacityStepSpec,
  capacityRaw,
  fakeDeps,
  latenciesWithP99,
  RAW_DIR,
  readFixtureDir,
  rejection,
  soakConfig
} from "./builders.js";

async function analyze(
  steps: CapacityStepSpec[],
  config = capacityConfig()
): Promise<CapacityBenchmarkResult> {
  const result = await createAnalyzeCapacity(fakeDeps(capacityRaw(steps)))({
    rawDir: RAW_DIR,
    benchmark: config
  });
  // Every result must be a valid report.json v1 benchmark entry.
  capacityBenchmarkResultSchema.parse(result);
  return result;
}

function measured(result: CapacityBenchmarkResult) {
  if (result.verdict !== "passed" && result.verdict !== "failed") {
    throw new Error(`expected a measured verdict, got ${result.verdict}`);
  }
  return result;
}

describe("createAnalyzeCapacity", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should stop at the first step whose p99 breaks the limit", async () => {
      // Arrange
      const steps = [50, 100, 150].map((offeredCps) => ({ offeredCps }));

      // Act
      const result = measured(
        await analyze([
          ...steps,
          { offeredCps: 200, latencies: latenciesWithP99(62) }
        ])
      );

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result.headline.limitCps).to.equal(150);
      expect(result.headline.limitIsLowerBound).to.equal(false);
      expect(result.stoppedBy).to.deep.equal({
        offeredCps: 200,
        rule: "p99LatencyMs",
        measured: 62,
        limit: 50
      });
      expect(result.rules).to.deep.equal([
        { id: "p99LatencyMs", limit: 50, measured: 5, passed: true },
        { id: "failedCallsPct", limit: 0.1, measured: 0, passed: true }
      ]);
      expect(result.unit).to.equal("messages");
      expect(result.series.steps).to.have.length(4);
    });

    it("should break the rule at exactly the p99 limit", async () => {
      // Act
      const result = measured(
        await analyze([
          { offeredCps: 50 },
          { offeredCps: 100, latencies: latenciesWithP99(50) }
        ])
      );

      // Assert
      expect(result.headline.limitCps).to.equal(50);
      expect(result.stoppedBy).to.include({
        rule: "p99LatencyMs",
        measured: 50
      });
    });

    it("should break the rule at exactly the failed calls limit", async () => {
      // Act
      const result = measured(
        await analyze([
          { offeredCps: 50 },
          { offeredCps: 100, attempted: 6000, failed: 6 }
        ])
      );

      // Assert
      expect(result.headline.limitCps).to.equal(50);
      expect(result.stoppedBy).to.deep.equal({
        offeredCps: 100,
        rule: "failedCallsPct",
        measured: 0.1,
        limit: 0.1
      });
    });

    it("should end the ramp where failed calls reach 0.3% with good latency", async () => {
      // Act
      const result = measured(
        await analyze([
          { offeredCps: 50 },
          { offeredCps: 100 },
          {
            offeredCps: 150,
            attempted: 9000,
            failed: 27,
            failuresByReason: {
              FailedTimeoutOnRecv: 20,
              FailedMaxUDPRetrans: 7
            }
          },
          { offeredCps: 200 }
        ])
      );

      // Assert
      expect(result.headline.limitCps).to.equal(100);
      expect(result.stoppedBy).to.include({
        offeredCps: 150,
        rule: "failedCallsPct",
        measured: 0.3
      });
      expect(result.series.steps[2]).to.include({ p99Ms: 5, failed: 27 });
      expect(result.series.steps[2]?.failuresByReason).to.deep.equal({
        FailedTimeoutOnRecv: 20,
        FailedMaxUDPRetrans: 7
      });
    });

    it("should fail with a null limit when the first step breaks a rule", async () => {
      // Act
      const result = measured(
        await analyze([{ offeredCps: 50, latencies: latenciesWithP99(80) }])
      );

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(result.headline).to.deep.equal({
        limitCps: null,
        limitIsLowerBound: false,
        p99AtLimitMs: null,
        p50AtLimitMs: null,
        failedAtLimitPct: null,
        retransmissionsAtLimitPct: null
      });
      expect(result.stoppedBy).to.include({ offeredCps: 50, measured: 80 });
      expect(result.rules[0]).to.include({ passed: false, measured: 80 });
    });

    it("should report a lower bound when every step up to rate.max passes", async () => {
      // Act
      const result = measured(
        await analyze(
          [
            { offeredCps: 50 },
            { offeredCps: 100, attempted: 6000, retransmissions: 12 }
          ],
          capacityConfig({ max: 100 })
        )
      );

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result.headline).to.deep.equal({
        limitCps: 100,
        limitIsLowerBound: true,
        p99AtLimitMs: 5,
        p50AtLimitMs: 5,
        failedAtLimitPct: 0,
        retransmissionsAtLimitPct: 0.2
      });
      expect(result.stoppedBy).to.equal(null);
    });

    it("should follow the configured thresholds", async () => {
      // Arrange
      const steps = [
        { offeredCps: 50, latencies: latenciesWithP99(10) },
        { offeredCps: 100, latencies: latenciesWithP99(19) },
        { offeredCps: 150, latencies: latenciesWithP99(30) },
        { offeredCps: 200, attempted: 12000, failed: 60 }
      ];

      // Act
      const strict = measured(
        await analyze(
          steps,
          capacityConfig({ p99LatencyMs: 20, failedCallsPct: 1 })
        )
      );
      const loose = measured(
        await analyze(
          steps,
          capacityConfig({ p99LatencyMs: 50, failedCallsPct: 1 })
        )
      );

      // Assert
      expect(strict.headline.limitCps).to.equal(100);
      expect(strict.stoppedBy).to.include({ rule: "p99LatencyMs", limit: 20 });
      expect(loose.headline.limitCps).to.equal(200);
      expect(loose.headline.limitIsLowerBound).to.equal(true);
    });

    it("should be inconclusive when SIPp's CPU is above 80%", async () => {
      // Act
      const result = await analyze([
        { offeredCps: 1250 },
        { offeredCps: 1300, sippCpuPct: 93 }
      ]);

      // Assert
      expect(result).to.include({
        verdict: "inconclusive",
        reason:
          "load generator saturated at 1,300 messages/s (SIPp at 93% of one core)"
      });
      expect(result).not.to.have.property("headline");
      expect(result).not.to.have.property("rules");
    });

    it("should be inconclusive when SIPp placed 110% of the offered rate", async () => {
      // SIPp that falls behind its schedule later sends the calls it owes in a
      // burst; that step measures the burst, not the server under test
      // Act
      const result = await analyze([
        { offeredCps: 50 },
        { offeredCps: 100, attempted: 6600 }
      ]);

      // Assert
      expect(result).to.include({
        verdict: "inconclusive",
        reason:
          "load generator sent a burst at 100 messages/s (placed 110 messages/s, 110% of offered)"
      });
    });

    it("should be inconclusive when SIPp placed 90% of the offered rate", async () => {
      // Act
      const result = await analyze([
        { offeredCps: 50 },
        { offeredCps: 100, attempted: 5400 }
      ]);

      // Assert
      expect(result).to.include({
        verdict: "inconclusive",
        reason:
          "load generator fell behind at 100 messages/s (placed 90 messages/s, 90% of offered)"
      });
      if (result.verdict !== "inconclusive") throw new Error("unreachable");
      expect(result.series?.steps.map((step) => step.valid)).to.deep.equal([
        true,
        false
      ]);
    });

    it("should be inconclusive when the load generator's RcvbufErrors rose", async () => {
      // Act
      const result = await analyze([
        { offeredCps: 50, loadgenDrops: 6 },
        { offeredCps: 100 }
      ]);

      // Assert
      expect(result).to.include({
        verdict: "inconclusive",
        reason:
          "load generator dropped UDP packets at 50 messages/s (6 buffer errors)"
      });
    });

    it("should check validity before the rules", async () => {
      // Act
      const result = await analyze([
        { offeredCps: 50, sippCpuPct: 95, latencies: latenciesWithP99(90) }
      ]);

      // Assert
      expect(result.verdict).to.equal("inconclusive");
    });

    it("should count a call's latency in the step its request was sent in", async () => {
      // Arrange: sent 2 ms before step 2 starts, answered 40 ms later.
      const files = capacityRaw([{ offeredCps: 50 }, { offeredCps: 100 }]);
      const meta = JSON.parse(files["meta.json"] as string);
      const startMs = Date.parse(meta.startedAt);
      const boundary = startMs + 60_000;
      files["uac_message_7_rtt.csv"] = [
        "Date_ms;response_time_ms;rtd_no",
        ...Array.from(
          { length: 100 },
          (_, k) => `${boundary - 2 + 40 - startMs + k * 0};40;1`
        ),
        `${boundary + 1000 - startMs};3;1`
      ].join("\n");

      // Act
      const result = await createAnalyzeCapacity(fakeDeps(files))({
        rawDir: RAW_DIR,
        benchmark: capacityConfig()
      });

      // Assert
      if (result.verdict !== "passed" && result.verdict !== "failed") {
        throw new Error(`unexpected ${result.verdict}`);
      }
      expect(result.series.steps[0]?.p99Ms).to.equal(40);
      expect(result.series.steps[1]?.p99Ms).to.equal(3);
    });

    it("should report SIPp and UUT CPU, and UDP drops, per step", async () => {
      // Act
      const result = measured(
        await analyze([{ offeredCps: 50, sippCpuPct: 12 }])
      );

      // Assert
      expect(result.series.steps[0]).to.include({
        sippCpuPct: 12,
        uutCpuPct: 100,
        loadgenUdpDrops: 0,
        uutUdpDrops: 0,
        calls: 3000,
        achievedCps: 50
      });
      expect(result.resources.processes.map((p) => p.name)).to.deep.equal([
        "edgeport",
        "echo"
      ]);
    });

    it("should count attempted calls per step as the OutgoingCall(P) of the recorded fixture", async () => {
      // Arrange
      const files = readFixtureDir("sipp-edgeport-echo");
      const meta = JSON.parse(files["meta.json"] as string);
      const startMs = Date.parse(meta.startedAt);
      const ticks = Array.from({ length: 19 }, (_, i) => startMs + i * 10_000);
      files["sampler.jsonl"] = ticks
        .map((tMs, i) =>
          JSON.stringify({
            t: new Date(tMs).toISOString(),
            host: "loadgen",
            name: "sipp-uac",
            pid: 1,
            rssKB: 9000,
            cpuTicks: i * 100,
            clkTck: 100,
            fds: 10
          })
        )
        .join("\n");
      files["udp.jsonl"] = "";
      const config = capacityConfig({ max: 150 });
      config.load.uac.scenario = "uac_invite_echo.xml";
      const stat = parseStatCsv(
        files["uac_invite_echo_1_.csv"] as string,
        "uac_invite_echo_1_.csv"
      );
      const expected = meta.steps.map((step: { from: string; to: string }) =>
        stat.rows
          .filter((row) => {
            const mid = (row.periodStartMs + row.tMs) / 2;
            return mid >= Date.parse(step.from) && mid < Date.parse(step.to);
          })
          .reduce((sum, row) => sum + (row.counters["OutgoingCall(P)"] ?? 0), 0)
      );

      // Act
      const result = measured(
        await createAnalyzeCapacity(fakeDeps(files))({
          rawDir: RAW_DIR,
          benchmark: config
        })
      );

      // Assert
      capacityBenchmarkResultSchema.parse(result);
      expect(expected).to.deep.equal([3003, 6024, 8920]);
      expect(result.series.steps.map((step) => step.calls)).to.deep.equal(
        expected
      );
      expect(result.verdict).to.equal("passed");
      expect(result.headline.limitIsLowerBound).to.equal(true);
      expect(result.series.steps.every((step) => step.failed === 0)).to.equal(
        true
      );
    });
  });

  describe("with invalid input", () => {
    it("should reject a missing raw directory through its schema", async () => {
      // Arrange
      const deps = fakeDeps({});

      // Act
      const run = createAnalyzeCapacity(deps)({ benchmark: capacityConfig() });

      // Assert
      const error = await rejection(run);
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("rawDir: required");
      expect(deps.readdir.called).to.equal(false);
    });

    it("should reject a soak config through its schema", async () => {
      // Arrange
      const deps = fakeDeps({});

      // Act
      const run = createAnalyzeCapacity(deps)({
        rawDir: RAW_DIR,
        benchmark: soakConfig()
      });

      // Assert
      const error = await rejection(run);
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("benchmark.kind");
      expect(deps.readdir.called).to.equal(false);
    });

    it("should reject a raw directory that does not exist", async () => {
      // Act
      const run = createAnalyzeCapacity(fakeDeps({}))({
        rawDir: "/nowhere",
        benchmark: capacityConfig()
      });

      // Assert
      const error = await rejection(run);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include(
        "/nowhere: cannot read the raw results: no such directory"
      );
    });

    it("should reject raw results without the scenario's stat file", async () => {
      // Arrange
      const files = capacityRaw([{ offeredCps: 50 }]);
      delete files["uac_message_7_.csv"];

      // Act
      const run = createAnalyzeCapacity(fakeDeps(files))({
        rawDir: RAW_DIR,
        benchmark: capacityConfig()
      });

      // Assert
      const error = await rejection(run);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include("no SIPp -trace_stat file");
    });
  });
  describe("spike tolerance (confirmSteps)", () => {
    const slow = latenciesWithP99(80);

    it("should treat a rule break followed by a pass as a spike and go on", async () => {
      // Act
      const result = measured(
        await analyze(
          [
            { offeredCps: 50 },
            { offeredCps: 100, latencies: slow },
            { offeredCps: 150 },
            { offeredCps: 200 }
          ],
          capacityConfig({ confirmSteps: 2 })
        )
      );

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result.headline.limitCps).to.equal(200);
      expect(result.headline.limitIsLowerBound).to.equal(true);
      expect(result.stoppedBy).to.equal(null);
      expect(result.series.steps.map((step) => step.spike)).to.deep.equal([
        undefined,
        true,
        undefined,
        undefined
      ]);
    });

    it("should end the ramp at the first of two steps in a row that break a rule", async () => {
      // Act
      const result = measured(
        await analyze(
          [
            { offeredCps: 50 },
            { offeredCps: 100 },
            { offeredCps: 150, latencies: slow },
            { offeredCps: 200, latencies: slow }
          ],
          capacityConfig({ confirmSteps: 2 })
        )
      );

      // Assert
      expect(result.headline.limitCps).to.equal(100);
      expect(result.headline.limitIsLowerBound).to.equal(false);
      expect(result.stoppedBy).to.include({
        offeredCps: 150,
        rule: "p99LatencyMs"
      });
      expect(result.series.steps.some((step) => step.spike)).to.equal(false);
    });

    it("should count a break on the last step as confirmed", async () => {
      // Act
      const result = measured(
        await analyze(
          [
            { offeredCps: 50 },
            { offeredCps: 100 },
            { offeredCps: 150, latencies: slow }
          ],
          capacityConfig({ confirmSteps: 2 })
        )
      );

      // Assert
      expect(result.headline.limitCps).to.equal(100);
      expect(result.stoppedBy).to.include({ offeredCps: 150 });
    });

    it("should end the ramp at the old first break with confirmSteps 1", async () => {
      // Act
      const result = measured(
        await analyze(
          [
            { offeredCps: 50 },
            { offeredCps: 100, latencies: slow },
            { offeredCps: 150 }
          ],
          capacityConfig({ confirmSteps: 1 })
        )
      );

      // Assert
      expect(result.headline.limitCps).to.equal(50);
    });

    it("should stay inconclusive when the load generator gives out after a spike", async () => {
      // Act
      const result = await analyze(
        [
          { offeredCps: 50 },
          { offeredCps: 100, latencies: slow },
          { offeredCps: 150, sippCpuPct: 93 }
        ],
        capacityConfig({ confirmSteps: 2 })
      );

      // Assert
      expect(result.verdict).to.equal("inconclusive");
    });
  });
});
