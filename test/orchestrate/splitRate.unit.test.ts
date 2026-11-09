/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { splitRate } from "../../src/orchestrate/splitRate.js";

describe("splitRate", () => {
  it("should split 50 over 8 into whole numbers that add up to 50", () => {
    // Act
    const shares = splitRate(50, 8);

    // Assert
    expect(shares).to.deep.equal([7, 7, 6, 6, 6, 6, 6, 6]);
    expect(shares.reduce((a, b) => a + b, 0)).to.equal(50);
  });

  it("should split evenly when the rate divides", () => {
    expect(splitRate(400, 4)).to.deep.equal([100, 100, 100, 100]);
  });

  it("should give a share of 0 to the last instances when the rate is below the count", () => {
    expect(splitRate(2, 4)).to.deep.equal([1, 1, 0, 0]);
  });

  it("should split a rate that is not a whole number evenly", () => {
    expect(splitRate(7.5, 3)).to.deep.equal([2.5, 2.5, 2.5]);
  });

  it("should return the rate itself for one instance", () => {
    expect(splitRate(120, 1)).to.deep.equal([120]);
  });
});
