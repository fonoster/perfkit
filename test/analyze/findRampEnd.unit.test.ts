/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { findRampEnd } from "../../src/analyze/findRampEnd.js";

const ok = { valid: true, broken: false };
const bad = { valid: true, broken: true };
const invalid = { valid: false, broken: false };

describe("findRampEnd", () => {
  it("should not end a ramp where every step passes", () => {
    expect(findRampEnd([ok, ok, ok], 2)).to.deep.equal({
      endIndex: -1,
      spikes: []
    });
  });

  it("should end at the first break with confirmSteps 1", () => {
    expect(findRampEnd([ok, bad, ok], 1)).to.deep.equal({
      endIndex: 1,
      spikes: []
    });
  });

  it("should list a break that the next step passes as a spike", () => {
    expect(findRampEnd([ok, bad, ok, ok], 2)).to.deep.equal({
      endIndex: -1,
      spikes: [1]
    });
  });

  it("should end at the start of a confirmed run", () => {
    expect(findRampEnd([ok, bad, ok, bad, bad], 2)).to.deep.equal({
      endIndex: 3,
      spikes: [1]
    });
  });

  it("should list every step of a run shorter than confirmSteps that a pass ends", () => {
    expect(findRampEnd([ok, bad, bad, ok], 3)).to.deep.equal({
      endIndex: -1,
      spikes: [1, 2]
    });
  });

  it("should confirm a run that reaches the last step", () => {
    expect(findRampEnd([ok, ok, bad], 3)).to.deep.equal({
      endIndex: 2,
      spikes: []
    });
  });

  it("should end at an invalid step at once", () => {
    expect(findRampEnd([ok, invalid, ok], 2).endIndex).to.equal(1);
  });

  it("should end at the invalid step that follows an unconfirmed break", () => {
    expect(findRampEnd([ok, bad, invalid], 2)).to.deep.equal({
      endIndex: 2,
      spikes: []
    });
  });
});
