/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildLiveSoak } from "../../src/live/buildLiveSoak.js";
import { MIN, SOAK, STARTED_MS } from "./state.js";

const samples = (
  name: string,
  fromMs: number,
  minutes: number,
  mbPerHour: number
) =>
  Array.from({ length: minutes * 6 + 1 }, (_, i) => ({
    name,
    tMs: fromMs + i * 10_000,
    rssKB: (100 + (mbPerHour * i * 10) / 3600) * 1024
  }));

describe("buildLiveSoak", () => {
  const loadStartedMs = STARTED_MS;

  it("should show raw memory and no growth before an hour after the warm-up", () => {
    // Arrange: 30 min warm-up + 40 min
    const progress = {
      samples: samples("one", loadStartedMs, 70, 2),
      placed: 420_000,
      failed: 3
    };

    // Act
    const live = buildLiveSoak({
      benchmark: SOAK,
      record: {
        startedMs: loadStartedMs - MIN,
        loadStartedMs,
        endedMs: null,
        points: []
      },
      selected: true,
      nowMs: loadStartedMs + 70 * MIN,
      estimatedStartMs: null,
      progress
    });

    // Assert
    expect(live).to.deep.include({
      state: "running",
      warmupS: 1800,
      durationS: 21600,
      plannedS: 23400,
      elapsedS: 4200,
      calls: { placed: 420_000, failed: 3 }
    });
    const one = live.memory.find((p) => p.name === "one");
    expect(one?.growthMBPerHour).to.equal(null);
    expect(one?.samples.length).to.be.at.most(300);
    expect(one?.samples[0]).to.deep.equal({
      t: new Date(loadStartedMs).toISOString(),
      rssMB: 100
    });
    expect(live.memory.map((p) => p.name)).to.deep.equal([
      "one",
      "edgeport",
      "postgres"
    ]);
  });

  it("should give the verdict's growth once a full hour after the warm-up is in", () => {
    // Arrange: 30 min warm-up + 61 min
    const progress = {
      samples: samples("one", loadStartedMs, 91, 2),
      placed: 1,
      failed: 0
    };

    // Act
    const live = buildLiveSoak({
      benchmark: SOAK,
      record: {
        startedMs: loadStartedMs,
        loadStartedMs,
        endedMs: null,
        points: []
      },
      selected: true,
      nowMs: loadStartedMs + 91 * MIN,
      estimatedStartMs: null,
      progress
    });

    // Assert
    expect(live.memory[0]?.growthMBPerHour).to.be.closeTo(2, 0.01);
    expect(live.memory[1]?.growthMBPerHour).to.equal(null);
  });

  it("should judge growth on the second half of the samples after the warm-up", () => {
    // Arrange: 30 min warm-up + 120 min; 20 MB/h for the first hour after
    // the warm-up, flat in the second
    const rising = samples("one", loadStartedMs, 90, 20);
    const top = rising.at(-1)?.rssKB ?? 0;
    const flat = Array.from({ length: 60 * 6 }, (_, i) => ({
      name: "one",
      tMs: loadStartedMs + 90 * MIN + (i + 1) * 10_000,
      rssKB: top
    }));

    // Act
    const live = buildLiveSoak({
      benchmark: SOAK,
      record: {
        startedMs: loadStartedMs,
        loadStartedMs,
        endedMs: null,
        points: []
      },
      selected: true,
      nowMs: loadStartedMs + 150 * MIN,
      estimatedStartMs: null,
      progress: { samples: [...rising, ...flat], placed: 1, failed: 0 }
    });

    // Assert
    expect(live.memory[0]?.growthMBPerHour).to.equal(0);
  });

  it("should be queued with nothing measured before it starts", () => {
    const live = buildLiveSoak({
      benchmark: SOAK,
      record: undefined,
      selected: true,
      nowMs: loadStartedMs,
      estimatedStartMs: loadStartedMs + MIN,
      progress: null
    });
    expect(live).to.deep.include({
      state: "queued",
      elapsedS: 0,
      calls: { placed: 0, failed: 0 },
      loadStartedAt: null
    });
    expect(live.memory.every((p) => p.samples.length === 0)).to.equal(true);
  });
});
