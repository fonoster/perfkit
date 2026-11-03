/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sinon from "sinon";
import { createAnalyzeSoak } from "../../src/analyze/index.js";
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
          passed: true
        },
        {
          id: "memoryGrowthMBPerHour",
          process: "edgeport",
          limit: 5,
          measured: 0,
          passed: true
        },
        {
          id: "memoryGrowthMBPerHour",
          process: "postgres",
          limit: 5,
          measured: 0,
          passed: true
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
          passed: false
        }
      ]);
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

    it("should evaluate the rules of a 20-minute soak with 20 minutes of samples", async () => {
      // Act
      const result = await analyze(
        { warmupS: 300, afterS: 1200 },
        soakConfig({ duration: "20m", warmup: "5m" })
      );

      // Assert
      expect(result.verdict).to.equal("passed");
      expect(result).to.have.property("rules");
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
