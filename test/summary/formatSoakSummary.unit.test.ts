/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  reportSchema,
  type SoakBenchmarkResult
} from "../../src/schemas/index.js";
import { formatSoakSummary } from "../../src/summary/formatSoakSummary.js";
import { loadReport, REPORT_FORMS } from "../fixtures.js";

function soakOf(form: (typeof REPORT_FORMS)[number]): SoakBenchmarkResult {
  const benchmark = reportSchema
    .parse(loadReport(form))
    .benchmarks.find(({ kind }) => kind === "soak");
  return benchmark as SoakBenchmarkResult;
}

describe("formatSoakSummary", () => {
  it("should list the load, every rule against its limit and p99 by hour", () => {
    // Act
    const text = formatSoakSummary(soakOf("failed"));

    // Assert
    expect(text).to.equal(
      [
        "**Load:** 100 calls/s, each held 30 s; 2,160,000 calls in all.",
        "",
        "| Rule | Measured | Limit | Result |",
        "| :--- | ---: | ---: | :--- |",
        "| Memory growth, one | +7.4 MB/h | 5 MB/h | failed |",
        "| Memory growth, edgeport | +0.3 MB/h | 5 MB/h | passed |",
        "| Memory growth, postgres | +0.1 MB/h | 5 MB/h | passed |",
        "| Failed calls | 0.01% | 0.1% | passed |",
        "| Restarts | 0 | 0 | passed |",
        "",
        "**p99:** 21 ms in the first hour, 34 ms in the last hour."
      ].join("\n")
    );
  });

  it("should be empty for an aborted soak", () => {
    // Act / Assert
    expect(formatSoakSummary(soakOf("aborted-soak"))).to.equal("");
  });
});
