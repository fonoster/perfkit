/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  leastSquaresSlope,
  THEIL_SEN_MAX_POINTS,
  theilSenSlope
} from "../../src/analyze/index.js";

const line = (n: number, slope: number) =>
  Array.from({ length: n }, (_, i) => ({ x: i, y: 10 + slope * i }));

describe("theilSenSlope", () => {
  it("should give the slope of points on a line", () => {
    expect(theilSenSlope(line(11, 2))).to.equal(2);
  });

  it("should give the median of the pairwise slopes, with an even count", () => {
    // Pairs: (0,0)-(1,1): 1, (0,0)-(2,4): 2, (1,1)-(2,4): 3; with (3,9): 3, 4, 5
    const points = [0, 1, 2, 3].map((x) => ({ x, y: x * x }));
    expect(theilSenSlope(points)).to.equal(3);
  });

  it("should barely move for a dip that pulls a least-squares fit", () => {
    // Arrange: flat at 100, the first quarter dips to 90
    const points = Array.from({ length: 100 }, (_, x) => ({
      x,
      y: x < 25 ? 90 : 100
    }));

    // Act & Assert
    expect(theilSenSlope(points)).to.equal(0);
    expect(leastSquaresSlope(points)).to.be.above(0.1);
  });

  it("should subsample a long series and still find its slope", () => {
    // Arrange
    const points = line(THEIL_SEN_MAX_POINTS * 5 + 3, 0.5);

    // Act
    const started = Date.now();
    const slope = theilSenSlope(points);

    // Assert
    expect(slope).to.be.closeTo(0.5, 1e-9);
    expect(Date.now() - started).to.be.below(2000);
  });

  it("should give 0 with fewer than two distinct x", () => {
    expect(theilSenSlope([])).to.equal(0);
    expect(theilSenSlope([{ x: 1, y: 1 }])).to.equal(0);
    expect(
      theilSenSlope([
        { x: 1, y: 1 },
        { x: 1, y: 5 }
      ])
    ).to.equal(0);
  });
});
