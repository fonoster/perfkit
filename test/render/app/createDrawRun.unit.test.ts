/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../../src/errors/ValidationError.js";
import { createDrawRun } from "../../../src/render/app/createDrawRun.js";
import { renderRunPage } from "../../../src/render/renderRunPage.js";
import { toPageContext } from "../../../src/render/toPageContext.js";
import { toRunEntry } from "../../../src/render/toRunEntry.js";
import { reportSchema, SCHEMA_IDS } from "../../../src/schemas/index.js";
import { type Json, loadReport } from "../../fixtures.js";

const report = loadReport("passed");
const entry = toRunEntry(reportSchema.parse(report));
const ID = entry.id;
const runs = { schema: SCHEMA_IDS.runs, project: "Routr", runs: [entry] };

function drawWith(files: Record<string, Json>) {
  const fetched: string[] = [];
  const drawRun = createDrawRun({
    version: "1.2.3",
    fetchText: async (path) => {
      fetched.push(path);
      if (!(path in files)) return { status: 404, text: "Not Found" };
      const value = files[path];
      if (value instanceof Error) throw value;
      return {
        status: 200,
        text: typeof value === "string" ? value : JSON.stringify(value)
      };
    }
  });
  return { drawRun, fetched };
}

const expected = (page: "latest" | "run") =>
  renderRunPage(
    toPageContext({
      report: reportSchema.parse(report),
      runs: [entry],
      current: entry,
      page,
      perfkitVersion: "1.2.3"
    })
  );

describe("createDrawRun", () => {
  describe("with valid input", () => {
    it("should draw the latest run at the site root, as renderRunPage does", async () => {
      // Arrange
      const { drawRun, fetched } = drawWith({
        "data/runs.json": runs,
        [`data/runs/${ID}/report.json`]: report
      });

      // Act
      const result = await drawRun({ path: "" });

      // Assert
      expect(result).to.deep.equal({
        ok: true,
        runId: ID,
        html: expected("latest"),
        liveUrl: null
      });
      expect(fetched).to.deep.equal([
        "data/runs.json",
        `data/runs/${ID}/report.json`
      ]);
    });

    it("should draw a run's page from its path", async () => {
      // Arrange
      const { drawRun } = drawWith({
        "data/runs.json": runs,
        [`data/runs/${ID}/report.json`]: report
      });

      // Act
      const result = await drawRun({ path: `runs/${ID}/` });

      // Assert
      expect(result).to.deep.equal({
        ok: true,
        runId: ID,
        html: expected("run"),
        liveUrl: null
      });
    });

    it("should return the project's live.json URL from the report", async () => {
      // Arrange
      const withLive = {
        ...report,
        project: {
          ...(report.project as object),
          live: { url: "https://perfkit.ngrok.app/live.json" }
        }
      };
      const { drawRun } = drawWith({
        "data/runs.json": runs,
        [`data/runs/${ID}/report.json`]: withLive
      });

      // Act
      const result = await drawRun({ path: "" });

      // Assert
      expect(result.ok && result.liveUrl).to.equal(
        "https://perfkit.ngrok.app/live.json"
      );
    });

    it("should read a report of the old layout from runs/<id>/", async () => {
      // Arrange
      const { drawRun, fetched } = drawWith({
        "data/runs.json": runs,
        [`runs/${ID}/report.json`]: report
      });

      // Act
      const result = await drawRun({ path: "" });

      // Assert
      expect(result.ok).to.equal(true);
      expect(fetched.at(-1)).to.equal(`runs/${ID}/report.json`);
    });

    it("should return the schema's errors for an invalid report", async () => {
      // Arrange
      const { drawRun } = drawWith({
        "data/runs.json": runs,
        [`data/runs/${ID}/report.json`]: {
          ...report,
          schema: "perfkit/report/v9"
        }
      });

      // Act
      const result = await drawRun({ path: "" });

      // Assert
      expect(result.ok).to.equal(false);
      expect(!result.ok && result.errors[0]).to.match(
        new RegExp(`^data/runs/${ID}/report.json: schema: `)
      );
    });

    it("should return an error line for a missing, unparsable or unreachable file", async () => {
      // Arrange
      const missing = drawWith({});
      const broken = drawWith({ "data/runs.json": "{" });
      const offline = drawWith({ "data/runs.json": new Error("offline") });

      // Act
      const results = await Promise.all(
        [missing, broken, offline].map(({ drawRun }) => drawRun({ path: "" }))
      );

      // Assert
      const [first, second, third] = results.map((r) => !r.ok && r.errors[0]);
      expect(first).to.equal("data/runs.json: cannot fetch: HTTP 404");
      expect(second).to.match(/^data\/runs.json: cannot parse: /);
      expect(third).to.equal("data/runs.json: cannot fetch: offline");
    });

    it("should say which run or page is missing", async () => {
      // Arrange
      const { drawRun } = drawWith({
        "data/runs.json": { ...runs, runs: [] }
      });

      // Act
      const latest = await drawRun({ path: "" });
      const other = await drawRun({ path: "runs/x/" });
      const nowhere = await drawRun({ path: "about/" });

      // Assert
      expect(latest).to.deep.equal({
        ok: false,
        errors: ["data/runs.json: no runs yet"]
      });
      expect(other).to.deep.equal({
        ok: false,
        errors: ["data/runs.json: no run x"]
      });
      expect(nowhere).to.deep.equal({
        ok: false,
        errors: ["perfkit: no run page at about/"]
      });
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and fetch nothing", async () => {
      // Arrange
      const { drawRun, fetched } = drawWith({});

      // Act
      const error = await drawRun({ path: 7 }).then(
        () => null,
        (err: unknown) => err
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(fetched).to.deep.equal([]);
    });
  });
});
