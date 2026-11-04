/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { detectFormat } from "../../src/validate/index.js";

const KNOWN =
  "this perfkit reads perfkit/v1, perfkit/report/v1, perfkit/runs/v1";

describe("detectFormat", () => {
  it("should tell the formats apart by apiVersion or schema", () => {
    expect(detectFormat({ apiVersion: "perfkit/v1" })).to.deep.equal({
      ok: true,
      format: "perfkit/v1"
    });
    expect(detectFormat({ schema: "perfkit/report/v1" })).to.deep.equal({
      ok: true,
      format: "perfkit/report/v1"
    });
    expect(detectFormat({ schema: "perfkit/runs/v1" })).to.deep.equal({
      ok: true,
      format: "perfkit/runs/v1"
    });
  });

  it("should reject an unknown schema or apiVersion", () => {
    expect(detectFormat({ schema: "perfkit/report/v9" })).to.deep.equal({
      ok: false,
      message: `unknown schema "perfkit/report/v9"; ${KNOWN}`
    });
    expect(detectFormat({ apiVersion: "perfkit/v2" })).to.deep.equal({
      ok: false,
      message: `unknown schema "perfkit/v2"; ${KNOWN}`
    });
  });

  it("should reject a document with neither field", () => {
    [null, [], "text", {}].forEach((document) => {
      expect(detectFormat(document)).to.deep.equal({
        ok: false,
        message: `no apiVersion or schema field; ${KNOWN}`
      });
    });
  });
});
