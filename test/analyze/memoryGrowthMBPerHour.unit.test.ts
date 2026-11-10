/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { memoryGrowthMBPerHour } from "../../src/analyze/index.js";

const HOUR_MS = 3_600_000;

describe("memoryGrowthMBPerHour", () => {
  it("should give one process's least-squares MB/h over the window", () => {
    // Arrange: 1 MB per hour in [1000, 1000 + 1 h], spikes outside it
    const samples = [
      { name: "one", tMs: 0, rssKB: 999_999 },
      { name: "one", tMs: 1000, rssKB: 1024 },
      { name: "one", tMs: 1000 + HOUR_MS, rssKB: 2048 },
      { name: "one", tMs: 2000 + HOUR_MS, rssKB: 999_999 },
      { name: "two", tMs: 2000, rssKB: 9 }
    ];
    const window = { fromMs: 1000, toMs: 1000 + HOUR_MS };

    // Act & Assert
    expect(memoryGrowthMBPerHour(samples, "one", window)).to.equal(1);
    expect(memoryGrowthMBPerHour(samples, "two", window)).to.equal(0);
  });
});
