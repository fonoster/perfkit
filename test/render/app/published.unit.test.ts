/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Every report published on Routr's gh-pages (benchmarks/runs/*\/report.json
 * as of 2026-11-05), copied byte for byte into test/fixtures/published. The
 * site is rendered from all of them, one run after the other as the workflow
 * would, and each page is opened in the browser app: it must pass the app's
 * validation and draw the page renderRunPage draws.
 */
import { expect } from "chai";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRenderSite } from "../../../src/render/createRenderSite.js";
import { ROOT } from "../../fixtures.js";
import { makeDeps } from "../site.js";
import { expectedPage, openPage, parsePage, realApp } from "./browser.js";

const DIR = join(ROOT, "test", "fixtures", "published");
const FILES = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

async function renderAll() {
  const written = new Map<string, string>();
  await FILES.reduce(async (previous, name) => {
    await previous;
    const history = written.get(join("out", "data", "runs.json"));
    const memory: Record<string, string> = {
      "report.json": readFileSync(join(DIR, name), "utf8"),
      ...(history === undefined ? {} : { "runs.json": history })
    };
    const site = makeDeps(memory, undefined, realApp);
    const result = await createRenderSite(site.deps)({
      report: "report.json",
      ...(history === undefined ? {} : { history: "runs.json" }),
      out: "out"
    });
    if (!result.ok) throw new Error(`${name}: ${result.errors.join("\n")}`);
    site.written.forEach((text, path) => written.set(path, text));
  }, Promise.resolve());
  return written;
}

describe("the reports published on Routr's gh-pages", () => {
  let written: Map<string, string>;

  before(async function () {
    this.timeout(30000);
    written = await renderAll();
  });

  it("should be all six", () => {
    expect(FILES).to.have.length(6);
  });

  FILES.forEach((name) => {
    const id = name.replace(/\.json$/, "");
    it(`should draw ${id} in the browser app as renderRunPage does`, async () => {
      // Arrange
      const report = JSON.parse(readFileSync(join(DIR, name), "utf8"));

      // Act
      const { document, errors } = await openPage(
        written,
        "out",
        `runs/${id}/`
      );

      // Assert
      expect(errors).to.deep.equal([]);
      expect(document.querySelector("[role=alert]")).to.equal(null);
      expect(document.documentElement.outerHTML).to.equal(
        parsePage(expectedPage(written, report, "run"))
      );
    });
  });

  it("should draw the newest as the latest page", async () => {
    // Arrange
    const newest = FILES[FILES.length - 1]!;
    const report = JSON.parse(readFileSync(join(DIR, newest), "utf8"));

    // Act
    const { document, errors } = await openPage(written, "out", "");

    // Assert
    expect(errors).to.deep.equal([]);
    expect(document.documentElement.outerHTML).to.equal(
      parsePage(expectedPage(written, report, "latest"))
    );
  });
});
