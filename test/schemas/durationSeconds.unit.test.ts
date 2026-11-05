/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { durationSeconds } from "../../src/schemas/durationSeconds.js";

describe("durationSeconds", () => {
  it("should convert seconds, minutes and hours", () => {
    expect(durationSeconds("15s")).to.equal(15);
    expect(durationSeconds("2m")).to.equal(120);
    expect(durationSeconds("1h")).to.equal(3600);
  });

  it("should return 0 for a string that is not a duration", () => {
    expect(durationSeconds("1.5m")).to.equal(0);
  });
});
