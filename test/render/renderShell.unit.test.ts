/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { load } from "cheerio";
import { renderShell } from "../../src/render/renderShell.js";
import { toRunEntry } from "../../src/render/toRunEntry.js";
import { reportSchema } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";

const run = toRunEntry(reportSchema.parse(loadReport("passed")));
const DESCRIPTION =
  "2 of 2 benchmarks passed. Routr v2.31.5, run of Nov 3, 2026 14:12 UTC, commit bd3254a.";

describe("renderShell", () => {
  it("should fill in the run's title, description and Open Graph tags", () => {
    // Act
    const $ = load(
      renderShell({
        project: "Routr",
        run,
        page: "run",
        perfkitVersion: "1.2.3"
      })
    );

    // Assert
    expect($("title").text()).to.equal("Routr benchmarks · v2.31.5");
    expect($('meta[name="description"]').attr("content")).to.equal(DESCRIPTION);
    expect($('meta[property="og:title"]').attr("content")).to.equal(
      "Routr benchmarks · v2.31.5"
    );
    expect($('meta[property="og:description"]').attr("content")).to.equal(
      DESCRIPTION
    );
    expect($('meta[property="og:site_name"]').attr("content")).to.equal(
      "Routr benchmarks"
    );
    expect($('meta[name="twitter:card"]').attr("content")).to.equal("summary");
  });

  it("should load the pinned app from the site root", () => {
    // Act
    const latest = load(
      renderShell({
        project: "Routr",
        run,
        page: "latest",
        perfkitVersion: "1.2.3"
      })
    );
    const page = load(
      renderShell({
        project: "Routr",
        run,
        page: "run",
        perfkitVersion: "1.2.3"
      })
    );

    // Assert
    expect(latest("script").attr("src")).to.equal("app/1.2.3/app.js");
    expect(latest("script").is("[defer]")).to.equal(true);
    expect(page("script").attr("src")).to.equal("../../app/1.2.3/app.js");
    expect(latest("noscript").html()).to.contain(
      `<a href="runs/${run.id}/report.json">`
    );
    expect(page("noscript").html()).to.contain('<a href="report.json">');
  });

  it("should escape the project's name", () => {
    // Act
    const html = renderShell({
      project: '<b>"Routr"</b>',
      run,
      page: "run",
      perfkitVersion: "1.2.3"
    });

    // Assert
    expect(html).to.not.contain("<b>");
    expect(load(html)("title").text()).to.equal(
      '<b>"Routr"</b> benchmarks · v2.31.5'
    );
  });
});
