/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { resolveLiveUrl } from "../../../src/render/app/resolveLiveUrl.js";

const PAGE = "https://fonoster.github.io/routr/benchmarks/";

describe("resolveLiveUrl", () => {
  it("should take ?live= first, then the report's live URL", () => {
    expect(
      resolveLiveUrl(
        `${PAGE}?live=http://localhost:8787/live.json`,
        "https://a.example/live.json"
      )
    ).to.equal("http://localhost:8787/live.json");
    expect(resolveLiveUrl(PAGE, "https://a.example/live.json")).to.equal(
      "https://a.example/live.json"
    );
  });

  it("should take site.json's URL before the report's, and ?live= over both", () => {
    expect(
      resolveLiveUrl(
        PAGE,
        "https://site.example/live.json",
        "https://report.example/live.json"
      )
    ).to.equal("https://site.example/live.json");
    expect(
      resolveLiveUrl(PAGE, null, "https://report.example/live.json")
    ).to.equal("https://report.example/live.json");
    expect(
      resolveLiveUrl(
        `${PAGE}?live=http://localhost:8787/live.json`,
        "https://site.example/live.json",
        "https://report.example/live.json"
      )
    ).to.equal("http://localhost:8787/live.json");
    expect(resolveLiveUrl(PAGE, null, null)).to.equal(null);
  });

  it("should be null without one, or for a URL that is not http or https", () => {
    expect(resolveLiveUrl(PAGE, null)).to.equal(null);
    expect(resolveLiveUrl(`${PAGE}?live=javascript:alert(1)`, null)).to.equal(
      null
    );
  });
});
