/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mergeRuns } from "../../src/render/mergeRuns.js";
import { toRunEntry } from "../../src/render/toRunEntry.js";
import { reportSchema, runsSchema } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";
import { loadHistory, RUNS_4 } from "./site.js";

describe("toRunEntry and mergeRuns", () => {
  it("should build a valid runs.json entry from a report", () => {
    // Arrange
    const report = reportSchema.parse(loadReport("failed"));

    // Act
    const entry = toRunEntry(report);

    // Assert
    expect(entry.path).to.equal("runs/20261020T100005Z-c0b54ab/");
    expect(entry.benchmarks).to.deep.equal([
      {
        id: "edgeport-echo",
        kind: "capacity",
        verdict: "failed",
        headline: { limitCps: null, p99AtLimitMs: null }
      },
      {
        id: "one-soak",
        kind: "soak",
        verdict: "failed",
        headline: { memoryGrowthMBPerHour: 7.4 }
      }
    ]);
  });

  it("should give unmeasured benchmarks a null headline", () => {
    // Arrange
    const report = reportSchema.parse(loadReport("not-run"));

    // Act
    const entry = toRunEntry(report);

    // Assert
    expect(entry.benchmarks.map((b) => b.headline)).to.deep.equal([null, null]);
  });

  it("should insert newest first and keep the index valid", () => {
    // Arrange
    const history = runsSchema.parse(loadHistory(RUNS_4));
    const entry = toRunEntry(reportSchema.parse(loadReport("aborted-soak")));

    // Act
    const merged = mergeRuns(history, entry, "Routr");

    // Assert
    expect(merged.runs[0]?.id).to.equal(entry.id);
    expect(merged.runs).to.have.length(5);
    expect(runsSchema.safeParse(merged).success).to.equal(true);
  });

  it("should replace a run with the same id", () => {
    // Arrange
    const history = runsSchema.parse(loadHistory(RUNS_4));
    const entry = toRunEntry(reportSchema.parse(loadReport("failed")));

    // Act
    const merged = mergeRuns(history, entry, "Routr");

    // Assert
    expect(merged.runs.map((r) => r.id)).to.deep.equal(
      history.runs.map((r) => r.id)
    );
    expect(merged.runs[2]).to.deep.equal(entry);
  });

  it("should start a new index without history", () => {
    // Arrange
    const entry = toRunEntry(reportSchema.parse(loadReport("passed")));

    // Act
    const merged = mergeRuns(null, entry, "Routr");

    // Assert
    expect(merged).to.deep.equal({
      schema: "perfkit/runs/v1",
      project: "Routr",
      runs: [entry]
    });
  });
});
