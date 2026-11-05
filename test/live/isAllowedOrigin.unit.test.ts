/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { isAllowedOrigin } from "../../src/live/isAllowedOrigin.js";

const SITE = "https://fonoster.github.io/routr/benchmarks";

describe("isAllowedOrigin", () => {
  it("should allow the project's site and pages on this machine", () => {
    expect(isAllowedOrigin("https://fonoster.github.io", SITE)).to.equal(true);
    expect(isAllowedOrigin("http://localhost:8080", SITE)).to.equal(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", SITE)).to.equal(true);
    expect(isAllowedOrigin("http://localhost", SITE)).to.equal(true);
  });

  it("should refuse any other origin", () => {
    expect(isAllowedOrigin("https://evil.example", SITE)).to.equal(false);
    expect(isAllowedOrigin("http://fonoster.github.io", SITE)).to.equal(false);
    expect(isAllowedOrigin("http://localhost.evil.example", SITE)).to.equal(
      false
    );
    expect(isAllowedOrigin("https://localhost:8080", SITE)).to.equal(false);
    expect(isAllowedOrigin("https://x", "not a url")).to.equal(false);
  });
});
