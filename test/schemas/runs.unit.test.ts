/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { runsSchema } from "../../src/schemas/index.js";
import { loadRuns } from "../fixtures.js";
import { errorsOf } from "./check.js";

describe("runsSchema", () => {
  it("should accept the committed runs.json", () => {
    expect(errorsOf(runsSchema, loadRuns())).to.deep.equal([]);
  });

  it("should accept an empty history", () => {
    expect(
      errorsOf(runsSchema, { schema: "perfkit/runs/v1", project: "Routr", runs: [] })
    ).to.deep.equal([]);
  });

  it("should accept a capacity headline with both numbers null", () => {
    // Arrange
    const runs = loadRuns();
    const failed = runs.runs.find((run: { version: string }) => run.version === "2.31.3");

    // Assert
    expect(failed.benchmarks[0].headline).to.deep.equal({
      limitCps: null,
      p99AtLimitMs: null
    });
    expect(errorsOf(runsSchema, runs)).to.deep.equal([]);
  });

  it("should require runs newest first", () => {
    const runs = loadRuns();
    runs.runs.reverse();
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      "runs[1].startedAt: expected runs newest first; this run started after runs[0]",
      "runs[2].startedAt: expected runs newest first; this run started after runs[1]",
      "runs[3].startedAt: expected runs newest first; this run started after runs[2]"
    ]);
  });

  it("should require a null headline for not-run, inconclusive and aborted", () => {
    const runs = loadRuns();
    runs.runs[1].benchmarks[0].headline = { limitCps: 200, p99AtLimitMs: 12 };
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      "runs[1].benchmarks[0].headline: expected null; got an object"
    ]);
  });

  it("should require the headline fields of the kind", () => {
    const runs = loadRuns();
    runs.runs[0].benchmarks[0].headline = { memoryGrowthMBPerHour: 1.8 };
    runs.runs[0].benchmarks[1].headline = { limitCps: 1240, p99AtLimitMs: 38 };
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      "runs[0].benchmarks[0].headline.limitCps: required",
      "runs[0].benchmarks[0].headline.memoryGrowthMBPerHour: unknown key",
      "runs[0].benchmarks[0].headline.p99AtLimitMs: required",
      "runs[0].benchmarks[1].headline.limitCps: unknown key",
      "runs[0].benchmarks[1].headline.memoryGrowthMBPerHour: required",
      "runs[0].benchmarks[1].headline.p99AtLimitMs: unknown key"
    ]);
  });

  it("should require limitCps and p99AtLimitMs null together", () => {
    const runs = loadRuns();
    runs.runs[0].benchmarks[0].headline.p99AtLimitMs = null;
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      "runs[0].benchmarks[0].headline: expected limitCps and p99AtLimitMs both null or both numbers"
    ]);
  });

  it("should require the run id to come from startedAt and commit", () => {
    const runs = loadRuns();
    runs.runs[0].commit = "0000000aaaa";
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      'runs[0].id: expected 20261103T141210Z-0000000, from startedAt and commit; got "20261103T141210Z-bd3254a"'
    ]);
  });

  it("should require the verdict to count every benchmark", () => {
    const runs = loadRuns();
    runs.runs[0].verdict.total = 3;
    expect(errorsOf(runsSchema, runs)).to.deep.equal([
      "runs[0].verdict.total: expected 2 to match benchmarks; got 3"
    ]);
  });
});
