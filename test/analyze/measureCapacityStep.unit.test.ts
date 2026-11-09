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
  samplerLines,
  START_MS,
  STEP_MS
} from "./builders.js";

/** A callee SIPp at `pct`% of one core, sampled every 10 s over the step. */
function calleeAt(name: string, pct: number): string[] {
  return Array.from({ length: 7 }, (_, tick) =>
    samplerLines(START_MS + tick * 10_000, [
      { host: "loadgen", name, cpuTicks: Math.round(tick * pct * 10) }
    ])
  ).flat();
}

async function step(
  spec: Parameters<typeof capacityRaw>[0][number],
  extraSampler: string[] = [],
  uacProcesses?: string[]
) {
  const files = capacityRaw([spec]);
  files["sampler.jsonl"] = [
    (files["sampler.jsonl"] as string).trimEnd(),
    ...extraSampler
  ].join("\n");
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
    ...(uacProcesses ? { uacProcesses } : {}),
    unit: "calls"
  });
}

describe("measureCapacityStep", () => {
  it("should mark a step invalid when the callee SIPp saturates", async () => {
    // Act
    const register = await step(
      { offeredCps: 40, attempted: 2400 },
      calleeAt("sipp-register", 86)
    );
    const uas = await step(
      { offeredCps: 40, attempted: 2400 },
      calleeAt("sipp-uas", 90)
    );
    const below = await step(
      { offeredCps: 40, attempted: 2400 },
      calleeAt("sipp-register", 80)
    );

    // Assert
    expect(register.invalidReason).to.equal(
      "load generator saturated at 40 calls/s (sipp-register at 86% of one core)"
    );
    expect(register.step.valid).to.equal(false);
    expect(register.step.sippCpuPct).to.equal(10);
    expect(uas.invalidReason).to.equal(
      "load generator saturated at 40 calls/s (sipp-uas at 90% of one core)"
    );
    expect(below.invalidReason).to.equal(null);
  });

  it("should judge each uac instance on its own core, and name the busy one", async () => {
    // Arrange: three instances, the third at 86% of its core, the rest idle
    const uacProcesses = ["sipp-uac", "sipp-uac-2", "sipp-uac-3"];

    // Act
    const busy = await step(
      { offeredCps: 40, attempted: 2400 },
      [...calleeAt("sipp-uac-2", 20), ...calleeAt("sipp-uac-3", 86)],
      uacProcesses
    );
    const fine = await step(
      { offeredCps: 40, attempted: 2400 },
      uacProcesses.slice(1).flatMap((name) => calleeAt(name, 70)),
      uacProcesses
    );

    // Assert: the busiest instance decides, not their sum (70 + 70 + 10 > 80)
    expect(busy.invalidReason).to.equal(
      "load generator saturated at 40 calls/s (SIPp instance sipp-uac-3 at 86% of one core)"
    );
    expect(busy.step.sippCpuPct).to.equal(86);
    expect(fine.invalidReason).to.equal(null);
    expect(fine.step.sippCpuPct).to.equal(70);
  });

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
