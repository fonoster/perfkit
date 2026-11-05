/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { toSitePath } from "../../../src/render/app/toSitePath.js";

const APP = "https://fonoster.github.io/routr/benchmarks/app/0.2.0/app.js";

describe("toSitePath", () => {
  it("should give the page's path relative to the site root above the app", () => {
    expect(
      toSitePath("https://fonoster.github.io/routr/benchmarks/", APP)
    ).to.equal("");
    expect(
      toSitePath(
        "https://fonoster.github.io/routr/benchmarks/runs/a-1/?x=1#all-runs",
        APP
      )
    ).to.equal("runs/a-1/");
  });

  it("should return null for a page outside the site", () => {
    expect(toSitePath("https://fonoster.github.io/routr/", APP)).to.equal(null);
    expect(toSitePath("https://example.com/routr/benchmarks/", APP)).to.equal(
      null
    );
  });
});
