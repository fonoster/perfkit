/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { createSummarizeReport } from "../../src/summary/createSummarizeReport.js";
import { type Json, loadReport, loadRuns } from "../fixtures.js";

function summarize(memory: Record<string, Json>) {
  return createSummarizeReport({
    readFile: async (path) => {
      if (!(path in memory)) {
        throw Object.assign(new Error("nope"), { code: "ENOENT" });
      }
      return JSON.stringify(memory[path]);
    },
    isFile: async (path) => path in memory
  });
}

describe("createSummarizeReport", () => {
  it("should return the report as Markdown", async () => {
    // Act
    const result = await summarize({ "report.json": loadReport("passed") })({
      report: "report.json"
    });

    // Assert
    expect(result.ok).to.equal(true);
    if (!result.ok) return;
    expect(result.markdown).to.match(
      /^## perfkit run 20261103T141210Z-bd3254a\n/
    );
  });

  it("should return the errors of an invalid report", async () => {
    // Arrange
    const report = loadReport("passed");
    delete report.run.commit;

    // Act
    const result = await summarize({ "report.json": report })({
      report: "report.json"
    });

    // Assert
    expect(result).to.deep.equal({
      ok: false,
      errors: ["report.json: run.commit: required"]
    });
  });

  it("should refuse a runs.json", async () => {
    // Act
    const result = await summarize({ "runs.json": loadRuns() })({
      report: "runs.json"
    });

    // Assert
    expect(result).to.deep.equal({
      ok: false,
      errors: [
        "runs.json: expected a perfkit/report/v1 report; got perfkit/runs/v1"
      ]
    });
  });

  it("should report a missing file", async () => {
    // Act
    const result = await summarize({})({ report: "missing.json" });

    // Assert
    expect(result).to.deep.equal({
      ok: false,
      errors: ["missing.json: cannot read: no such file"]
    });
  });

  it("should throw ValidationError for an empty path", async () => {
    // Act
    const error = await summarize({})({ report: "" }).catch((e: unknown) => e);

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
  });
});
