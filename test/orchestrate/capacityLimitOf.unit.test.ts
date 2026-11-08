/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { capacityLimitOf } from "../../src/orchestrate/capacityLimitOf.js";
import type { BenchmarkResult } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";

const THRESHOLDS = { p99LatencyMs: 150, failedCallsPct: 0.1 };

function step(offeredCps: number, extra: Record<string, unknown> = {}) {
  return {
    offeredCps,
    achievedCps: offeredCps,
    calls: offeredCps * 60,
    p50Ms: 5,
    p95Ms: 8,
    p99Ms: 10,
    failed: 0,
    failuresByReason: {},
    retransmissions: 0,
    sippCpuPct: 20,
    uutCpuPct: 50,
    loadgenUdpDrops: 0,
    uutUdpDrops: 0,
    valid: true,
    ...extra
  };
}

function inconclusive(steps: ReturnType<typeof step>[]): BenchmarkResult {
  return {
    id: "one-mix",
    kind: "capacity",
    title: "t",
    narrative: { what: "w", why: "y", how: "h" },
    unit: "calls",
    verdict: "inconclusive",
    reason: "load generator fell behind at 400 calls/s",
    durationS: 600,
    tool: "SIPp 3.7.3, UDP",
    series: { steps }
  } as BenchmarkResult;
}

describe("capacityLimitOf", () => {
  it("should take a passed benchmark's limit, with its lower-bound flag", () => {
    const passed = (loadReport("passed") as { benchmarks: BenchmarkResult[] })
      .benchmarks[0]!;
    expect(capacityLimitOf(passed, THRESHOLDS)).to.deep.equal({
      cps: 1240,
      lowerBound: false
    });
  });

  it("should take the highest step before the load generator fell behind as a lower bound", () => {
    const result = inconclusive([
      step(100),
      step(200),
      step(300),
      step(400, { valid: false, achievedCps: 300 })
    ]);
    expect(capacityLimitOf(result, THRESHOLDS)).to.deep.equal({
      cps: 300,
      lowerBound: true
    });
  });

  it("should give no limit when a step before the invalid one broke a rule, or the first step is invalid", () => {
    expect(
      capacityLimitOf(
        inconclusive([
          step(100),
          step(200, { p99Ms: 200 }),
          step(300, { valid: false })
        ]),
        THRESHOLDS
      )
    ).to.equal(null);
    expect(
      capacityLimitOf(inconclusive([step(100, { valid: false })]), THRESHOLDS)
    ).to.equal(null);
  });

  it("should give no limit for a failed, aborted or missing result", () => {
    const failed = (
      loadReport("failed") as { benchmarks: BenchmarkResult[] }
    ).benchmarks.find((b) => b.kind === "capacity")!;
    expect(capacityLimitOf(failed, THRESHOLDS)).to.equal(null);
    expect(capacityLimitOf(null, THRESHOLDS)).to.equal(null);
  });
});
