/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { toPageContext } from "../../src/render/toPageContext.js";
import { toRunEntry } from "../../src/render/toRunEntry.js";
import { reportSchema } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";

describe("toPageContext", () => {
  const report = reportSchema.parse(loadReport("passed"));
  const current = toRunEntry(report);
  const params = { report, runs: [current], current, perfkitVersion: "1.2.3" };

  it("should put the latest page at the site root", () => {
    expect(toPageContext({ ...params, page: "latest" }).base).to.equal("");
  });

  it("should climb two levels from a run page", () => {
    expect(toPageContext({ ...params, page: "run" })).to.deep.equal({
      ...params,
      page: "run",
      base: "../../"
    });
  });
});
