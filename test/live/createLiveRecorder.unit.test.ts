/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { createLiveRecorder } from "../../src/live/createLiveRecorder.js";
import { point } from "./state.js";

describe("createLiveRecorder", () => {
  it("should record each benchmark's times and points, and the run's end", () => {
    // Arrange
    const recorder = createLiveRecorder();

    // Act
    recorder.started("a", 1);
    recorder.loadStarted("a", 2);
    recorder.point("a", point(50));
    recorder.done("a", 3);
    recorder.finished();

    // Assert
    expect(recorder.read()).to.deep.equal({
      status: "finished",
      reason: null,
      benchmarks: {
        a: { startedMs: 1, loadStartedMs: 2, endedMs: 3, points: [point(50)] }
      }
    });
  });

  it("should record why the run failed", () => {
    const recorder = createLiveRecorder();
    recorder.failed("the agent failed: boom");
    expect(recorder.read()).to.include({
      status: "failed",
      reason: "the agent failed: boom"
    });
  });

  it("should hand out copies that later notes don't change", () => {
    const recorder = createLiveRecorder();
    recorder.started("a", 1);
    const before = recorder.read();
    recorder.point("a", point(50));
    expect(before.benchmarks.a?.points).to.deep.equal([]);
  });
});
