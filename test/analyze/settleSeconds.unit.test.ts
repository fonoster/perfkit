/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { DEFAULT_SETTLE_S, settleSeconds } from "../../src/analyze/index.js";

describe("settleSeconds", () => {
  it("should take the soak's settle", () => {
    expect(settleSeconds({ settle: "45m", duration: "2h" })).to.equal(2700);
  });

  it("should default to 30 minutes", () => {
    expect(settleSeconds({ duration: "8h" })).to.equal(DEFAULT_SETTLE_S);
  });

  it("should default to half of a duration shorter than an hour", () => {
    expect(settleSeconds({ duration: "20m" })).to.equal(600);
  });
});
