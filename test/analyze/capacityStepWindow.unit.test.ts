/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  capacityStepWindow,
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

describe("capacityStepWindow", () => {
  it("should start only the first step's window warmup later", () => {
    const window = (index: number) =>
      capacityStepWindow({
        startedMs: 0,
        index,
        everyMs: 60_000,
        warmupMs: 20_000
      });
    expect(window(0)).to.deep.equal({ fromMs: 20_000, toMs: 60_000 });
    expect(window(1)).to.deep.equal({ fromMs: 60_000, toMs: 120_000 });
  });

  it("should cut the window at endedMs and never start after it ends", () => {
    expect(
      capacityStepWindow({
        startedMs: 0,
        index: 0,
        everyMs: 60_000,
        warmupMs: 20_000,
        endedMs: 10_000
      })
    ).to.deep.equal({ fromMs: 10_000, toMs: 10_000 });
  });

  it("should leave the warm-up's slow calls and stat rows out of the first step", async () => {
    // Arrange: the first 30 of 100 calls (sent in the first 18 s) take 200 ms.
    const latencies = [
      ...Array.from({ length: 30 }, () => 200),
      ...Array.from({ length: 70 }, () => 5)
    ];
    const files = capacityRaw([{ offeredCps: 100, latencies }]);
    const uac = await readSippResults(
      fakeDeps(files),
      RAW_DIR,
      Object.keys(files),
      "uac_message.xml"
    );
    const measure = (warmupMs: number) =>
      measureCapacityStep({
        offeredCps: 100,
        window: capacityStepWindow({
          startedMs: START_MS,
          index: 0,
          everyMs: STEP_MS,
          warmupMs
        }),
        uac: uac!,
        samples: parseSamplerJsonl(
          files["sampler.jsonl"] as string,
          "sampler.jsonl"
        ),
        udp: parseUdpJsonl(files["udp.jsonl"] as string, "udp.jsonl"),
        uutProcesses: ["edgeport"],
        unit: "calls"
      }).step;

    // Act
    const cold = measure(0);
    const warm = measure(20_000);

    // Assert: the stat rows at 10 s and 20 s (mid-points 5 s and 15 s) are out.
    expect(cold.p99Ms).to.equal(200);
    expect(warm).to.include({
      p99Ms: 5,
      calls: 4000,
      achievedCps: 100,
      valid: true
    });
  });
});
