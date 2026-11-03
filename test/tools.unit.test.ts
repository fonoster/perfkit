/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { SIPP_BINARY, SIPP_IMAGE } from "../src/tools.js";

describe("tools", () => {
  it("should pin a SIPp 3.7 image by digest", () => {
    expect(SIPP_IMAGE).to.match(/^[^@\s]+:3\.7\.\d+@sha256:[0-9a-f]{64}$/);
    expect(SIPP_BINARY).to.equal("/sipp/sipp");
  });
});
