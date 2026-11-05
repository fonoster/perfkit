/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { describeStep } from "../../../src/render/live/describeStep.js";
import type { LiveCapacity, LiveSoak } from "../../../src/schemas/index.js";
import { sampleLive } from "../../live/sample.js";

describe("describeStep", () => {
  const live = sampleLive();
  const capacity = live.benchmarks[0] as LiveCapacity;
  const soak = live.benchmarks[1] as LiveSoak;

  it("should say what a done ramp held, preliminary", () => {
    expect(describeStep(capacity)).to.equal(
      "held 100 messages/s · preliminary"
    );
  });

  it("should say which step a running ramp is on", () => {
    expect(
      describeStep({
        ...capacity,
        state: "running",
        current: { index: 13, total: 37, offeredCps: 4250 }
      })
    ).to.equal("step 14 of 37 · 4,250 messages/s");
  });

  it("should say how far a soak is, and when a queued one starts", () => {
    expect(describeStep(soak)).to.equal("45 min of 6 h 30 min · 100 calls/s");
    expect(describeStep({ ...soak, elapsedS: 600 })).to.equal(
      "warm-up · 10 min of 6 h 30 min"
    );
    expect(
      describeStep({
        ...soak,
        state: "queued",
        estimatedStartAt: "2026-11-06T14:55:00Z"
      })
    ).to.equal("starts about 14:55 UTC");
  });
});
