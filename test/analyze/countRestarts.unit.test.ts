/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { countRestarts } from "../../src/analyze/countRestarts.js";
import type { ProcessSample } from "../../src/analyze/types.js";

const sample = (tick: number, name: string, pid: number): ProcessSample => ({
  t: new Date(tick * 10_000).toISOString(),
  tMs: tick * 10_000,
  host: "uut",
  name,
  pid,
  rssKB: 1,
  cpuTicks: 0,
  clkTck: 100,
  fds: 0
});

/** Ticks 0 to 9 of `a` with the given pids; null leaves the tick out. */
const run = (pids: Array<number | null>) =>
  pids.flatMap((pid, tick) => (pid === null ? [] : [sample(tick, "a", pid)]));

describe("countRestarts", () => {
  it("should count a pid change and a run of missing ticks once each on a server", () => {
    // Arrange: a pid change, then a gap of two ticks
    // (the ticks are the times any process was sampled, so "b" keeps them)
    const samples = [
      ...run([1, 1, 2, 2, null, null, 2, 2]),
      ...Array.from({ length: 8 }, (_, tick) => sample(tick, "b", 7))
    ];

    // Act and assert
    expect(countRestarts(samples, ["a"])).to.equal(2);
  });

  describe("from the pods' counters", () => {
    it("should not count missing ticks as restarts", () => {
      // Arrange
      const samples = run([1, null, 1, null, null, 1, 1]);

      // Act and assert
      expect(countRestarts(samples, ["a"], { fromCounters: true })).to.equal(0);
    });

    it("should count each rise of the pid, also across a gap", () => {
      // Arrange: 1 to 2, a gap, then 2 to 4
      const samples = run([1, 2, null, 2, 4]);

      // Act and assert
      expect(countRestarts(samples, ["a"], { fromCounters: true })).to.equal(3);
    });

    it("should add up the names", () => {
      // Arrange
      const samples = [
        ...run([1, 2]),
        ...[sample(0, "b", 1), sample(1, "b", 2)]
      ];

      // Act and assert
      expect(
        countRestarts(samples, ["a", "b"], { fromCounters: true })
      ).to.equal(2);
    });
  });
});
