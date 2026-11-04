/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { describeValue } from "../../src/errors/index.js";

describe("describeValue", () => {
  it("should quote strings and print scalars", () => {
    expect(describeValue("ok")).to.equal('"ok"');
    expect(describeValue(5)).to.equal("5");
    expect(describeValue(false)).to.equal("false");
    expect(describeValue(null)).to.equal("null");
    expect(describeValue(undefined)).to.equal("nothing");
  });

  it("should name arrays and objects without dumping them", () => {
    expect(describeValue([1, 2])).to.equal("an array");
    expect(describeValue({ token: "secret" })).to.equal("an object");
  });
});
