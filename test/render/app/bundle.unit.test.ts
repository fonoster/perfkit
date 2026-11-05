/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { join } from "node:path";
import { createDrawRun } from "../../../src/render/app/createDrawRun.js";
import { loadReport, REPORT_FORMS } from "../../fixtures.js";
import { loadHistory, RUNS_4 } from "../site.js";
import {
  expectedPage,
  openPage,
  parsePage,
  realApp,
  renderWithApp
} from "./browser.js";

describe("the browser app", () => {
  before(async function () {
    this.timeout(20000);
    await realApp();
  });

  const histories = { none: null, "runs.json": RUNS_4 };
  REPORT_FORMS.forEach((form) => {
    Object.entries(histories).forEach(([name, file]) => {
      it(`should draw the same page as renderRunPage (${form}, history ${name})`, async () => {
        // Arrange
        const report = loadReport(form);
        const written = await renderWithApp(
          report,
          file === null ? null : loadHistory(file)
        );
        const newest = JSON.parse(
          written.get(join("out", "data", "runs.json")) ?? "null"
        ).runs[0].id;
        const pages: Array<["latest" | "run", string]> = [
          ["run", `runs/${report.run.id}/`],
          ...(newest === report.run.id
            ? [["latest", ""] as ["latest", string]]
            : [])
        ];

        // Act
        const opened = await Promise.all(
          pages.map(([, path]) => openPage(written, "out", path))
        );

        // Assert
        opened.forEach(({ document, errors }, index) => {
          const [kind, path] = pages[index]!;
          expect(errors, path).to.deep.equal([]);
          expect(document.documentElement.outerHTML, path).to.equal(
            parsePage(expectedPage(written, report, kind))
          );
        });
      });
    });
  });

  it("should run the picker script once", async () => {
    // Arrange
    const report = loadReport("passed");
    const written = await renderWithApp(report, loadHistory(RUNS_4));
    const { document } = await openPage(written, "out", "");
    const button = document.querySelector<HTMLButtonElement>(
      "[data-picker] button"
    );

    // Act
    button?.click();

    // Assert
    expect(button?.getAttribute("aria-expanded")).to.equal("true");
    expect(
      document.querySelector<HTMLElement>(".picker-panel")?.hidden
    ).to.equal(false);
  });

  it("should show the error lines in the shell for a run not in data/runs.json", async () => {
    // Arrange
    const report = loadReport("passed");
    const written = await renderWithApp(report, null);
    written.set(
      join("out", "runs", "20200101T000000Z-0000000", "index.html"),
      written.get(join("out", "runs", report.run.id, "index.html")) ?? ""
    );

    // Act
    const { document, errors } = await openPage(
      written,
      "out",
      "runs/20200101T000000Z-0000000/"
    );

    // Assert
    expect(errors).to.deep.equal([]);
    expect(document.querySelector("[role=alert] pre")?.textContent).to.equal(
      "data/runs.json: no run 20200101T000000Z-0000000"
    );
  });

  it("should show zod's English error lines for an invalid report", async () => {
    // Arrange
    const report = loadReport("passed");
    const written = await renderWithApp(report, null);
    const path = join("out", "data", "runs", report.run.id, "report.json");
    const broken = { ...report, project: { ...report.project, name: 7 } };
    written.set(path, JSON.stringify(broken));
    const drawRun = createDrawRun({
      version: "9.8.7",
      fetchText: async (file) => ({
        status: 200,
        text: written.get(join("out", ...file.split("/"))) ?? ""
      })
    });
    const inNode = await drawRun({ path: "" });

    // Act
    const { document, errors } = await openPage(written, "out", "");

    // Assert
    expect(errors).to.deep.equal([]);
    expect(inNode.ok).to.equal(false);
    expect(document.querySelector("[role=alert] pre")?.textContent).to.equal(
      !inNode.ok ? inNode.errors.join("\n") : null
    );
  });
});
