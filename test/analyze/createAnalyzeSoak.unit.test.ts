/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sinon from "sinon";
import {
  createAnalyzeSoak,
  leastSquaresSlope
} from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import {
  soakBenchmarkResultSchema,
  type SoakBenchmarkResult
} from "../../src/schemas/index.js";
import {
  capacityConfig,
  fakeDeps,
  FIXTURES,
  RAW_DIR,
  rejection,
  soakConfig,
  soakRaw,
  type SoakRawSpec
} from "./builders.js";

const MB = 1024;
/** 2 h after a 30 min warm-up from 14:00, less the 30 min settle period. */
const WINDOW = {
  from: "2026-11-03T15:00:00.000Z",
  to: "2026-11-03T16:30:00.000Z"
};

async function analyze(
  spec: Partial<SoakRawSpec> = {},
  config = soakConfig(),
  extraFiles: Record<string, string> = {}
): Promise<SoakBenchmarkResult> {
  const files = {
    ...soakRaw({ warmupS: 1800, afterS: 7200, ...spec }),
    ...extraFiles
  };
  const result = await createAnalyzeSoak(fakeDeps(files))({
    rawDir: RAW_DIR,
    benchmark: config
  });
  // Every result must be a valid report.json v1 benchmark entry.
  soakBenchmarkResultSchema.parse(result);
  return result;
}

function measured(result: SoakBenchmarkResult) {
  if (result.verdict !== "passed" && result.verdict !== "failed") {
    throw new Error(`expected a measured verdict, got ${result.verdict}`);
  }
  return result;
}

describe("createAnalyzeSoak", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should pass when RSS grows steeply in the warm-up and stays flat after", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (_name, hours) => ({
            rssKB: hours < 0 ? (200 + hours * 400) * MB : 200 * MB
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result.headline.memoryGrowthMBPerHour).to.equal(0);
      expect(result.rules).to.deep.equal([
        {
          id: "memoryGrowthMBPerHour",
          process: "one",
          limit: 5,
          measured: 0,
          passed: true,
          window: WINDOW
        },
        {
          id: "memoryGrowthMBPerHour",
          process: "edgeport",
          limit: 5,
          measured: 0,
          passed: true,
          window: WINDOW
        },
        {
          id: "memoryGrowthMBPerHour",
          process: "postgres",
          limit: 5,
          measured: 0,
          passed: true,
          window: WINDOW
        },
        { id: "failedCallsPct", limit: 0.1, measured: 0, passed: true },
        { id: "restarts", limit: 0, measured: 0, passed: true }
      ]);
      expect(result.warmupS).to.equal(1800);
      expect(result.load).to.deep.equal({ cps: 100, holdS: 30 });
      expect(result.unit).to.equal("calls");
    });

    it("should fail the process that grows 6 MB/h and pass the flat ones", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            rssKB: (name === "edgeport" ? 300 + 6 * hours : 100) * MB
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(result.headline.memoryGrowthMBPerHour).to.equal(6);
      expect(result.rules.filter((rule) => !rule.passed)).to.deep.equal([
        {
          id: "memoryGrowthMBPerHour",
          process: "edgeport",
          limit: 5,
          measured: 6,
          passed: false,
          window: WINDOW
        }
      ]);
    });

    it("should pass RSS that climbs for 15 min after the warm-up, then stays flat within ±25 MB", async () => {
      // Arrange: start-up climbs 2,200 to 2,310 MB in 15 min (the shape of
      // Routr run 42699126885), then ±25 MB of noise; over the whole window
      // the slope is about 20 MB/h
      const noise = (hours: number) =>
        25 * Math.sin(hours * 60 * 2.399) * Math.cos(hours * 60 * 0.7);
      const rssAt = (hours: number) =>
        hours < 0.25 ? 2200 + Math.max(0, hours) * 440 : 2310 + noise(hours);

      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            rssKB: Math.round((name === "one" ? rssAt(hours) : 100) * MB)
          })
        })
      );

      // Assert
      const one = result.rules[0];
      expect(one).to.include({ process: "one", passed: true });
      expect(Math.abs(one?.measured ?? Infinity)).to.be.below(5);
      expect(result.verdict).to.equal("passed");
    });

    it("should fail a steady 10 MB/h rise", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            rssKB: Math.round((name === "one" ? 2300 + 10 * hours : 100) * MB)
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(result.rules[0]).to.deep.equal({
        id: "memoryGrowthMBPerHour",
        process: "one",
        limit: 5,
        measured: 10,
        passed: false,
        window: WINDOW
      });
    });

    it("should pass Routr run 42699126885's RoutrOne: start-up climb, then flat with a dip", async () => {
      // Arrange: its RSS once a minute; it climbs until about minute 25,
      // then stays at 2,280 to 2,352 MB with a dip at minutes 60 to 80
      const { rssMB } = JSON.parse(
        readFileSync(
          join(FIXTURES, "soak", "routr-42699126885-one-rss.json"),
          "utf8"
        )
      ) as { rssMB: number[] };
      const rssAt = (hours: number) =>
        rssMB[Math.min(130, Math.max(0, Math.round(hours * 60 + 10)))] ?? 0;
      const wholeWindow = leastSquaresSlope(
        rssMB.slice(10).map((y, i) => ({ x: i / 60, y }))
      );

      // Act
      const result = measured(
        await analyze(
          {
            warmupS: 600,
            afterS: 7200,
            processAt: (name, hours) => ({
              rssKB: Math.round((name === "one" ? rssAt(hours) : 100) * MB)
            })
          },
          soakConfig({ warmup: "10m" })
        )
      );

      // Assert: a least-squares fit from the warm-up on failed it
      expect(wholeWindow).to.be.above(5);
      expect(result.rules[0]).to.include({ process: "one", passed: true });
      expect(Math.abs(result.rules[0]?.measured ?? Infinity)).to.be.below(1);
    });

    it("should leave samples after the end of the load out of the growth", async () => {
      // Arrange: flat during the load, then 500 MB/h for 10 min after it
      const result = measured(
        await analyze({
          tailS: 600,
          processAt: (name, hours) => ({
            rssKB: Math.round((100 + Math.max(0, hours - 2) * 500) * MB)
          })
        })
      );

      // Assert
      expect(result.rules[0]).to.deep.equal({
        id: "memoryGrowthMBPerHour",
        process: "one",
        limit: 5,
        measured: 0,
        passed: true,
        window: WINDOW
      });
    });

    it("should start the window after the soak's own settle period", async () => {
      // Act
      const result = measured(await analyze({}, soakConfig({ settle: "45m" })));

      // Assert
      expect(result.settleS).to.equal(2700);
      expect(result.rules[0]).to.have.deep.property("window", {
        from: "2026-11-03T15:15:00.000Z",
        to: "2026-11-03T16:30:00.000Z"
      });
    });

    it("should fail at exactly 5.0 MB/h", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            rssKB: (name === "one" ? 100 + 5 * hours : 100) * MB
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(result.rules[0]).to.include({ measured: 5, passed: false });
    });

    it("should count a pid change after the warm-up as one restart", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            pid: name === "one" && hours > 1 ? 99 : 41
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(result.rules.at(-1)).to.deep.equal({
        id: "restarts",
        limit: 0,
        measured: 1,
        passed: false
      });
    });

    it("should not count a pid change during the warm-up", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) => ({
            pid: name === "one" && hours > -0.2 ? 99 : 41
          })
        })
      );

      // Assert
      expect(result.verdict).to.equal("passed");
    });

    it("should count a sample where a process is missing as a restart", async () => {
      // Act
      const result = measured(
        await analyze({
          processAt: (name, hours) =>
            name === "postgres" && hours > 1 && hours < 1.05 ? null : {}
        })
      );

      // Assert
      expect(result.rules.at(-1)).to.include({ measured: 1, passed: false });
    });

    describe("on the cluster", () => {
      const helmConfig = () => {
        const base = soakConfig();
        return {
          ...base,
          uut: {
            helm: {
              chart: "../ops/charts/connect",
              values: "k8s/values.yaml",
              entry: { service: "routr-edgeport-tcp", port: 5060 },
              pods: ["one", "edgeport", "postgres"].map((name) => ({
                name,
                selector: `service=${name}`
              }))
            }
          }
        } as unknown as typeof base;
      };

      it("should not count gaps in the samples as restarts", async () => {
        // Arrange: 29 gaps, as the metrics API left in a real run, and no pod restarted
        const gap = (name: string, hours: number) =>
          Array.from({ length: 29 }, (_, i) => 0.05 + i * 0.06).some(
            (from) => hours >= from && hours < from + 0.02
          ) && name !== "one";

        // Act
        const result = measured(
          await analyze(
            { processAt: (name, hours) => (gap(name, hours) ? null : {}) },
            helmConfig()
          )
        );

        // Assert
        expect(result.rules.at(-1)).to.deep.equal({
          id: "restarts",
          limit: 0,
          measured: 0,
          passed: true
        });
      });

      it("should count a rise of the pid, the pod counters' restarts", async () => {
        // Act
        const result = measured(
          await analyze(
            {
              processAt: (name, hours) => ({
                pid: name === "edgeport" ? (hours > 1 ? 3 : 1) : 1
              })
            },
            helmConfig()
          )
        );

        // Assert
        expect(result.rules.at(-1)).to.include({ measured: 2, passed: false });
      });
    });

    it("should fail when failed calls reach 0.1% after the warm-up", async () => {
      // Act
      const result = measured(await analyze({ failedPerRow: 60 }));

      // Assert
      expect(result.verdict).to.equal("failed");
      expect(
        result.rules.find((rule) => rule.id === "failedCallsPct")
      ).to.deep.equal({
        id: "failedCallsPct",
        limit: 0.1,
        measured: 0.1,
        passed: false
      });
    });

    it("should leave the warm-up's failed calls out", async () => {
      // Act: every warm-up row has 50 failed calls of 60,000.
      const result = measured(await analyze());

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result.headline).to.deep.equal({
        memoryGrowthMBPerHour: 0,
        calls: 720_000,
        registrations: 200,
        registerFailures: 0
      });
    });

    it("should report latency drift, fds, concurrent calls and register failures", async () => {
      // Act
      const result = measured(
        await analyze({
          registerFailedPerRow: 2,
          processAt: (name, hours) => ({
            fds: name === "edgeport" ? 300 + Math.round(hours * 10) : 50
          })
        })
      );

      // Assert
      expect(result.reported).to.deep.equal({
        p99FirstHourMs: 4,
        p99LastHourMs: 9,
        maxOpenFds: { one: 50, edgeport: 320, postgres: 50 },
        maxConcurrentCalls: 3000
      });
      expect(result.headline.registerFailures).to.equal(24);
    });

    it("should abort when the samples after the warm-up cover 5 h of 6 h", async () => {
      // Act
      const result = await analyze(
        { afterS: 5 * 3600 },
        soakConfig({ duration: "6h" })
      );

      // Assert
      expect(result).to.deep.include({
        verdict: "aborted",
        reason: "ended before 90% of the planned duration after the warm-up"
      });
      expect(result).not.to.have.property("rules");
    });

    it("should abort, not pass, a soak that placed no call after the warm-up", async () => {
      // Act
      const result = await analyze({ callsPerRow: 0 });

      // Assert
      expect(result).to.deep.include({
        verdict: "aborted",
        reason: "no calls were placed after the warm-up"
      });
      expect(result).not.to.have.property("rules");
      expect(result).to.have.property("resources");
    });

    it("should abort a soak whose uac left no response times instead of reporting a p99 of 0", async () => {
      // Act
      const result = await analyze({ noRtt: true });

      // Assert
      expect(result).to.deep.include({
        verdict: "aborted",
        reason:
          "no response times from one-soak/uac_invite.xml: SIPp wrote no uac_invite_<pid>_rtt.csv, so the p99 latency can't be measured"
      });
      expect(result).not.to.have.property("reported");
    });

    it("should evaluate the rules of a 20-minute soak with 20 minutes of samples", async () => {
      // Act
      const result = await analyze(
        { warmupS: 300, afterS: 1200 },
        soakConfig({ duration: "20m", warmup: "5m" })
      );

      // Assert: the default settle period is half of a short duration
      expect(result.verdict).to.equal("passed");
      expect(result).to.have.property("settleS", 600);
    });

    it("should compute hops from the spans after the warm-up", async () => {
      // Arrange
      const spans = readFileSync(
        join(FIXTURES, "spans", "grpc-hops.jsonl"),
        "utf8"
      );

      // Act
      const result = measured(
        await analyze({}, soakConfig({ otlp: true }), { "spans.jsonl": spans })
      );

      // Assert
      expect(result.hops).to.deep.equal({
        sampleRatio: 0.01,
        spans: 9,
        services: [
          { service: "location", p50Ms: 3, p99Ms: 3 },
          { service: "processor", p50Ms: 16, p99Ms: 26 },
          { service: "routr-connect", p50Ms: 1, p99Ms: 1 }
        ]
      });
    });

    it("should stream spans.jsonl through readLines when the deps have it", async () => {
      // Arrange
      const spans = readFileSync(
        join(FIXTURES, "spans", "grpc-hops.jsonl"),
        "utf8"
      );
      const files = {
        ...soakRaw({ warmupS: 1800, afterS: 7200 }),
        "spans.jsonl": spans
      };
      const deps = fakeDeps(files);
      const readLines = sinon.stub().callsFake(async function* () {
        yield* spans.split("\n");
      });

      // Act
      const result = await createAnalyzeSoak({ ...deps, readLines })({
        rawDir: RAW_DIR,
        benchmark: soakConfig({ otlp: true })
      });

      // Assert
      expect(readLines).to.have.been.calledOnceWith(`${RAW_DIR}/spans.jsonl`);
      expect(deps.readFile).not.to.have.been.calledWith(
        `${RAW_DIR}/spans.jsonl`
      );
      expect(measured(result).hops?.spans).to.equal(9);
    });
  });

  describe("with invalid input", () => {
    it("should reject a missing raw directory through its schema", async () => {
      // Arrange
      const deps = fakeDeps({});

      // Act
      const error = await rejection(
        createAnalyzeSoak(deps)({ benchmark: soakConfig() })
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("rawDir: required");
      expect(deps.readdir.called).to.equal(false);
    });

    it("should reject a capacity config through its schema", async () => {
      // Arrange
      const deps = fakeDeps({});

      // Act
      const error = await rejection(
        createAnalyzeSoak(deps)({
          rawDir: RAW_DIR,
          benchmark: capacityConfig()
        })
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("benchmark.kind");
      expect(deps.readdir.called).to.equal(false);
    });

    it("should reject a meta.json of the wrong kind", async () => {
      // Arrange
      const files = soakRaw({ warmupS: 1800, afterS: 7200 });
      files["meta.json"] = JSON.stringify({
        ...JSON.parse(files["meta.json"] as string),
        kind: "capacity"
      });

      // Act
      const error = await rejection(
        createAnalyzeSoak(fakeDeps(files))({
          rawDir: RAW_DIR,
          benchmark: soakConfig()
        })
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("meta.json: kind");
    });
  });
});
