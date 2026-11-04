/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseDocument } from "../../src/validate/index.js";

describe("parseDocument", () => {
  it("should parse .json as JSON and anything else as YAML", () => {
    expect(parseDocument('{"a": 1}', "report.json")).to.deep.equal({ a: 1 });
    expect(parseDocument("a: 1\nb: [x]\n", "perfkit.yaml")).to.deep.equal({
      a: 1,
      b: ["x"]
    });
  });

  it("should throw on malformed text", () => {
    expect(() => parseDocument("{", "report.json")).to.throw();
    expect(() => parseDocument("a: 1\na: 2\n", "perfkit.yaml")).to.throw(
      /unique/
    );
  });
});
