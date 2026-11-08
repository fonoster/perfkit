/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseKubeQuantity } from "../../src/orchestrate/parseKubeQuantity.js";

describe("parseKubeQuantity", () => {
  it("should read CPU in nano, micro and milli cores and whole cores", () => {
    expect(parseKubeQuantity("123456789n")).to.be.closeTo(0.123456789, 1e-12);
    expect(parseKubeQuantity("500u")).to.be.closeTo(0.0005, 1e-12);
    expect(parseKubeQuantity("250m")).to.equal(0.25);
    expect(parseKubeQuantity("2")).to.equal(2);
  });

  it("should read memory in binary and decimal units", () => {
    expect(parseKubeQuantity("1Ki")).to.equal(1024);
    expect(parseKubeQuantity("12Mi")).to.equal(12 * 1024 * 1024);
    expect(parseKubeQuantity("1G")).to.equal(1e9);
    expect(parseKubeQuantity("1048576")).to.equal(1048576);
  });

  it("should return null for text that is not a quantity", () => {
    expect(parseKubeQuantity("")).to.equal(null);
    expect(parseKubeQuantity("12Xi")).to.equal(null);
    expect(parseKubeQuantity("-5m")).to.equal(null);
  });
});
