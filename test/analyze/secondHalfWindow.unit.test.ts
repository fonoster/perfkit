/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { secondHalfWindow } from "../../src/analyze/index.js";

describe("secondHalfWindow", () => {
  it("should give the second half of the window after the warm-up", () => {
    expect(secondHalfWindow(1000, 5000)).to.deep.equal({
      fromMs: 3000,
      toMs: 5000
    });
  });

  it("should give an empty window when the end is not after the warm-up", () => {
    expect(secondHalfWindow(1000, 500)).to.deep.equal({
      fromMs: 1000,
      toMs: 1000
    });
  });
});
