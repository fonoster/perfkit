/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { memoryGrowthMBPerHour } from "../../src/analyze/index.js";

describe("memoryGrowthMBPerHour", () => {
  it("should give one process's least-squares MB/h after the warm-up", () => {
    // Arrange: 1 MB per hour after t=1000, a spike before it
    const samples = [
      { name: "one", tMs: 0, rssKB: 999_999 },
      { name: "one", tMs: 1000, rssKB: 1024 },
      { name: "one", tMs: 1000 + 3_600_000, rssKB: 2048 },
      { name: "two", tMs: 2000, rssKB: 9 }
    ];

    // Act & Assert
    expect(memoryGrowthMBPerHour(samples, "one", 1000)).to.equal(1);
    expect(memoryGrowthMBPerHour(samples, "two", 1000)).to.equal(0);
  });
});
