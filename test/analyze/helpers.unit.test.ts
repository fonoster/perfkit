/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  durationToSeconds,
  leastSquaresSlope,
  nearestRank
} from "../../src/analyze/index.js";
import { inWindow } from "../../src/analyze/inWindow.js";
import { roundTo } from "../../src/analyze/roundTo.js";
import { thrown } from "./builders.js";

describe("nearestRank", () => {
  it("should take the value at rank ceil(p / 100 * n)", () => {
    // Arrange
    const values = Array.from({ length: 100 }, (_, i) => 100 - i);

    // Act + Assert
    expect(nearestRank(values, 50)).to.equal(50);
    expect(nearestRank(values, 95)).to.equal(95);
    expect(nearestRank(values, 99)).to.equal(99);
    expect(nearestRank([7], 99)).to.equal(7);
    expect(nearestRank([1, 2, 3], 0)).to.equal(1);
  });

  it("should be 0 without values", () => {
    expect(nearestRank([], 99)).to.equal(0);
  });
});

describe("leastSquaresSlope", () => {
  it("should fit a line through noisy points", () => {
    // Arrange
    const points = [0, 1, 2, 3].map((x) => ({
      x,
      y: 2 * x + (x % 2 ? 0.5 : -0.5)
    }));

    // Act + Assert
    expect(roundTo(leastSquaresSlope(points))).to.equal(2.2);
  });

  it("should be 0 with fewer than two points or one x", () => {
    expect(leastSquaresSlope([{ x: 1, y: 5 }])).to.equal(0);
    expect(
      leastSquaresSlope([
        { x: 1, y: 5 },
        { x: 1, y: 9 }
      ])
    ).to.equal(0);
  });
});

describe("durationToSeconds", () => {
  it("should read s, m and h", () => {
    expect(durationToSeconds("30s")).to.equal(30);
    expect(durationToSeconds("20m")).to.equal(1200);
    expect(durationToSeconds("6h")).to.equal(21600);
  });

  it("should throw on anything else", () => {
    expect(thrown(() => durationToSeconds("1d")).message).to.equal(
      "invalid duration: 1d"
    );
  });
});

describe("roundTo", () => {
  it("should round to 3 decimals", () => {
    expect(roundTo(4.99999999)).to.equal(5);
    expect(roundTo(0.12345)).to.equal(0.123);
  });
});

describe("inWindow", () => {
  it("should include from and exclude to", () => {
    const window = { fromMs: 10, toMs: 20 };
    expect(inWindow(10, window)).to.equal(true);
    expect(inWindow(19.9, window)).to.equal(true);
    expect(inWindow(20, window)).to.equal(false);
    expect(inWindow(9, window)).to.equal(false);
  });
});
