/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { downsample } from "../../src/live/downsample.js";

describe("downsample", () => {
  it("should keep a short series as it is", () => {
    expect(downsample([1, 2, 3], 5)).to.deep.equal([1, 2, 3]);
  });

  it("should keep at most max items, evenly spaced, first and last kept", () => {
    // Arrange
    const items = Array.from({ length: 1000 }, (_, i) => i);

    // Act
    const result = downsample(items, 300);

    // Assert
    expect(result).to.have.length(300);
    expect(result[0]).to.equal(0);
    expect(result.at(-1)).to.equal(999);
    expect([...result].sort((a, b) => a - b)).to.deep.equal(result);
  });

  it("should keep only the last item when max is 1", () => {
    expect(downsample([1, 2, 3], 1)).to.deep.equal([3]);
  });
});
