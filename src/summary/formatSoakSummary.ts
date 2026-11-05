/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { SoakBenchmarkResult, SoakRule } from "../schemas/index.js";
import { cell, growth, num, pct, table } from "./markdown.js";

/**
 * The body of one soak benchmark in the run summary: its rules (memory
 * growth per process, failed calls, restarts) against their limits, and p99
 * in the first and the last hour. The heading and the verdict line are the
 * caller's.
 */
export function formatSoakSummary(benchmark: SoakBenchmarkResult): string {
  if (benchmark.verdict !== "passed" && benchmark.verdict !== "failed") {
    return "";
  }
  const unit = benchmark.unit;
  const rules = table(
    ["Rule", "Measured", "Limit", "Result"],
    benchmark.rules.map((rule) => [
      cell(ruleName(rule, unit)),
      measuredOf(rule),
      limitOf(rule),
      rule.passed ? "passed" : "failed"
    ]),
    [false, true, true, false]
  );
  const { reported, headline, load } = benchmark;
  return [
    `**Load:** ${num(load.cps)} ${unit}/s, each held ${num(load.holdS)} s; ${num(headline.calls, 0)} ${unit} in all.`,
    rules,
    `**p99:** ${num(reported.p99FirstHourMs)} ms in the first hour, ${num(reported.p99LastHourMs)} ms in the last hour.`
  ].join("\n\n");
}

function ruleName(rule: SoakRule, unit: string): string {
  if (rule.id === "memoryGrowthMBPerHour") {
    return `Memory growth, ${rule.process}`;
  }
  return rule.id === "failedCallsPct" ? `Failed ${unit}` : "Restarts";
}

function measuredOf(rule: SoakRule): string {
  if (rule.id === "memoryGrowthMBPerHour") return growth(rule.measured);
  return rule.id === "failedCallsPct"
    ? pct(rule.measured)
    : num(rule.measured, 0);
}

function limitOf(rule: SoakRule): string {
  if (rule.id === "memoryGrowthMBPerHour") return `${num(rule.limit)} MB/h`;
  return rule.id === "failedCallsPct" ? pct(rule.limit) : num(rule.limit, 0);
}
