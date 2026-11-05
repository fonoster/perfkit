/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  type CapacityBenchmarkResult,
  reportSchema
} from "../../src/schemas/index.js";
import { formatCapacitySummary } from "../../src/summary/formatCapacitySummary.js";
import { loadReport, REPORT_FORMS } from "../fixtures.js";

function capacityOf(
  form: (typeof REPORT_FORMS)[number]
): CapacityBenchmarkResult {
  const benchmark = reportSchema
    .parse(loadReport(form))
    .benchmarks.find(({ kind }) => kind === "capacity");
  return benchmark as CapacityBenchmarkResult;
}

describe("formatCapacitySummary", () => {
  it("should give the limit, where the ramp stopped and every step", () => {
    // Arrange
    const benchmark = capacityOf("passed");

    // Act
    const text = formatCapacitySummary(benchmark);

    // Assert
    const lines = text.split("\n");
    expect(lines[0]).to.equal(
      "**Capacity limit:** 1,240 messages/s, p99 30.9 ms, 0.04% failed."
    );
    expect(lines[2]).to.equal(
      "**Stopped at** 1,300 messages/s: p99 62 ms, limit 50 ms."
    );
    expect(lines[4]).to.equal(
      "| Offered (messages/s) | Placed (messages/s) | p99 | Failed | Result |"
    );
    expect(lines[6]).to.equal("| 50 | 49.6 | 4 ms | 0% | ok |");
    expect(lines.at(-1)).to.equal(
      "| 1,300 | 1,289.6 | 62 ms | 0.06% | stopped: p99 over 50 ms |"
    );
    expect(lines.length).to.equal(
      6 + (benchmark.verdict === "passed" ? benchmark.series.steps.length : 0)
    );
  });

  it("should say the limit is a lower bound when no step broke a rule", () => {
    // Act
    const text = formatCapacitySummary(capacityOf("lower-bound"));

    // Assert
    expect(text.split("\n")[0]).to.equal(
      "**Capacity limit:** at least 5,000 messages/s, p99 18.4 ms, 0.02% failed (no step broke a rule)."
    );
    expect(text).to.not.include("Stopped at");
  });

  it("should say there is no limit when the first step broke a rule", () => {
    // Act
    const text = formatCapacitySummary(capacityOf("failed"));

    // Assert
    expect(text).to.include(
      "**Capacity limit:** none, the first step already broke a rule."
    );
    expect(text).to.include(
      "| 50 | 49.6 | 72 ms | 0.03% | stopped: p99 over 50 ms |"
    );
  });

  it("should mark a step over the failed limit and an invalid step", () => {
    // Arrange
    const benchmark = capacityOf("passed");
    if (benchmark.verdict !== "passed") throw new Error("expected passed");
    const [first, second] = benchmark.series.steps;
    const steps = [
      { ...first!, calls: 1000, failed: 5 },
      { ...second!, valid: false }
    ];

    // Act
    const text = formatCapacitySummary({
      ...benchmark,
      series: { steps }
    });

    // Assert
    expect(text).to.include("| 0.5% | stopped: failed over 0.1% |");
    expect(text).to.include("| invalid; stopped |");
  });

  it("should list a partial benchmark's steps without limits", () => {
    // Act
    const text = formatCapacitySummary(capacityOf("not-run"));

    // Assert
    expect(text).to.not.include("Capacity limit");
    expect(text.split("\n").at(-1)).to.equal(
      "| 200 | 198.4 | 7 ms | 0.03% | ok |"
    );
  });

  it("should be empty for a benchmark that did not run", () => {
    // Act
    const text = formatCapacitySummary({
      ...capacityOf("passed"),
      verdict: "not-run",
      reason: "the run was aborted before this benchmark started"
    } as CapacityBenchmarkResult);

    // Assert
    expect(text).to.equal("");
  });
});
