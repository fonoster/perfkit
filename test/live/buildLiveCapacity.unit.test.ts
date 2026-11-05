/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildLiveCapacity } from "../../src/live/buildLiveCapacity.js";
import { CAPACITY, MIN, point, record, STARTED_MS } from "./state.js";

const at = (minutes: number) => STARTED_MS + minutes * MIN;

describe("buildLiveCapacity", () => {
  it("should be queued with its estimated start before it starts", () => {
    const live = buildLiveCapacity({
      benchmark: CAPACITY,
      record: undefined,
      selected: true,
      nowMs: at(1),
      estimatedStartMs: at(5)
    });
    expect(live).to.deep.include({
      state: "queued",
      current: null,
      heldCps: null,
      result: null,
      estimatedStartAt: new Date(at(5)).toISOString(),
      plannedS: 100 * 60
    });
  });

  it("should give the step offered now from the clock and what held so far", () => {
    // Arrange
    const rec = record({
      [CAPACITY.id]: {
        startedMs: at(0),
        loadStartedMs: at(1),
        points: [point(50), point(100)]
      }
    }).benchmarks[CAPACITY.id];

    // Act: 2.5 steps of 60 s after the load started
    const live = buildLiveCapacity({
      benchmark: CAPACITY,
      record: rec,
      selected: true,
      nowMs: at(3.5),
      estimatedStartMs: null
    });

    // Assert
    expect(live.state).to.equal("running");
    expect(live.current).to.deep.equal({
      index: 2,
      total: 100,
      offeredCps: 150
    });
    expect(live.heldCps).to.equal(100);
    expect(live.points).to.have.length(2);
    expect(live.rate).to.deep.equal({
      start: 50,
      step: 50,
      everyS: 60,
      max: 5000
    });
  });

  it("should stay on the step that broke a rule, and end there once done", () => {
    // Arrange
    const points = [point(50), point(100), point(150, false)];
    const running = {
      startedMs: at(0),
      loadStartedMs: at(1),
      endedMs: null,
      points
    };

    // Act
    const live = buildLiveCapacity({
      benchmark: CAPACITY,
      record: running,
      selected: true,
      nowMs: at(30),
      estimatedStartMs: null
    });
    const done = buildLiveCapacity({
      benchmark: CAPACITY,
      record: { ...running, endedMs: at(5) },
      selected: true,
      nowMs: at(30),
      estimatedStartMs: null
    });

    // Assert
    expect(live.current?.offeredCps).to.equal(150);
    expect(done.state).to.equal("done");
    expect(done.current).to.equal(null);
    expect(done.result).to.deep.equal({
      limitCps: 100,
      lowerBound: false,
      stopReason: "over the p99 limit"
    });
  });

  it("should call a ramp that never broke a rule a lower bound", () => {
    const live = buildLiveCapacity({
      benchmark: CAPACITY,
      record: {
        startedMs: 1,
        loadStartedMs: 2,
        endedMs: 3,
        points: [point(50)]
      },
      selected: true,
      nowMs: 4,
      estimatedStartMs: null
    });
    expect(live.result).to.deep.equal({
      limitCps: 50,
      lowerBound: true,
      stopReason: null
    });
  });

  it("should be not-run when not selected", () => {
    const live = buildLiveCapacity({
      benchmark: CAPACITY,
      record: undefined,
      selected: false,
      nowMs: 0,
      estimatedStartMs: 5
    });
    expect(live.state).to.equal("not-run");
    expect(live.estimatedStartAt).to.equal(null);
  });
});
