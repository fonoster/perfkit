/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { formatPath } from "../../src/errors/index.js";

describe("formatPath", () => {
  it("should format keys and indexes as a JSON path", () => {
    expect(formatPath(["benchmarks", 1, "verdict"])).to.equal(
      "benchmarks[1].verdict"
    );
  });

  it("should quote keys that are not identifiers", () => {
    expect(formatPath(["images", "my image", 0])).to.equal(
      'images["my image"][0]'
    );
  });

  it("should name the document itself $", () => {
    expect(formatPath([])).to.equal("$");
  });
});
