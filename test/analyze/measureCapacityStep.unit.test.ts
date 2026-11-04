/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  measureCapacityStep,
  parseSamplerJsonl,
  parseUdpJsonl,
  readSippResults
} from "../../src/analyze/index.js";
import {
  capacityRaw,
  fakeDeps,
  RAW_DIR,
  START_MS,
  STEP_MS
} from "./builders.js";

async function step(spec: Parameters<typeof capacityRaw>[0][number]) {
  const files = capacityRaw([spec]);
  const uac = await readSippResults(
    fakeDeps(files),
    RAW_DIR,
    Object.keys(files),
    "uac_message.xml"
  );
  return measureCapacityStep({
    offeredCps: spec.offeredCps,
    window: { fromMs: START_MS, toMs: START_MS + STEP_MS },
    uac: uac!,
    samples: parseSamplerJsonl(
      files["sampler.jsonl"] as string,
      "sampler.jsonl"
    ),
    udp: parseUdpJsonl(files["udp.jsonl"] as string, "udp.jsonl"),
    uutProcesses: ["edgeport"],
    unit: "calls"
  });
}

describe("measureCapacityStep", () => {
  it("should measure a valid step", async () => {
    // Act
    const measured = await step({
      offeredCps: 100,
      attempted: 6000,
      failed: 3,
      retransmissions: 9,
      latencies: [1, 2, 3, 4, 100]
    });

    // Assert
    expect(measured.invalidReason).to.equal(null);
    expect(measured.failedPct).to.equal(0.05);
    expect(measured.step).to.deep.equal({
      offeredCps: 100,
      achievedCps: 100,
      calls: 6000,
      p50Ms: 3,
      p95Ms: 100,
      p99Ms: 100,
      failed: 3,
      failuresByReason: {},
      retransmissions: 9,
      sippCpuPct: 10,
      uutCpuPct: 50,
      loadgenUdpDrops: 0,
      uutUdpDrops: 0,
      valid: true
    });
  });

  it("should not count SIPp at exactly 80% or achieved at exactly 95% as saturated", async () => {
    // Act
    const measured = await step({
      offeredCps: 100,
      attempted: 5700,
      sippCpuPct: 80
    });

    // Assert
    expect(measured.invalidReason).to.equal(null);
    expect(measured.step.valid).to.equal(true);
  });

  it("should name the step and the cause when SIPp saturates", async () => {
    // Act
    const measured = await step({ offeredCps: 1300, sippCpuPct: 93 });

    // Assert
    expect(measured.step.valid).to.equal(false);
    expect(measured.invalidReason).to.equal(
      "load generator saturated at 1,300 calls/s (SIPp at 93% of one core)"
    );
  });
});
