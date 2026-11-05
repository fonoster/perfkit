/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { BENCHMARK_OVERHEAD_S } from "../../src/live/constants.js";
import { estimateSchedule } from "../../src/live/estimateSchedule.js";
import { CAPACITY, MIN, point, record, SOAK, STARTED_MS } from "./state.js";

const OVERHEAD = BENCHMARK_OVERHEAD_S * 1000;

describe("estimateSchedule", () => {
  it("should queue every benchmark after the one running, with its planned time", () => {
    // Arrange: the ramp's load started 10 min ago, of 100 min
    const records = record({
      [CAPACITY.id]: { startedMs: STARTED_MS, loadStartedMs: STARTED_MS }
    }).benchmarks;
    const nowMs = STARTED_MS + 10 * MIN;

    // Act
    const schedule = estimateSchedule({
      benchmarks: [CAPACITY, SOAK],
      records,
      nowMs
    });

    // Assert
    const soakStart = nowMs + 90 * MIN + OVERHEAD / 3;
    expect(schedule.startsMs.get(SOAK.id)).to.equal(soakStart);
    expect(schedule.endMs).to.equal(soakStart + 390 * MIN + OVERHEAD);
  });

  it("should end a ramp that stopped soon, and skip what is done", () => {
    const records = record({
      [CAPACITY.id]: {
        startedMs: 1,
        loadStartedMs: 1,
        points: [point(50, false)]
      },
      [SOAK.id]: { startedMs: 1, endedMs: 2 }
    }).benchmarks;
    const schedule = estimateSchedule({
      benchmarks: [CAPACITY, SOAK],
      records,
      nowMs: 1000
    });
    expect(schedule.endMs).to.equal(1000 + OVERHEAD / 3);
    expect(schedule.startsMs.size).to.equal(0);
  });
});
