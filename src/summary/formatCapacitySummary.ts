/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { CapacityBenchmarkResult, Step } from "../schemas/index.js";
import { cell, num, pct, table } from "./markdown.js";

/**
 * The body of one capacity benchmark in the run summary: the capacity limit
 * and the step table (offered and placed rate, p99, failed %, and whether
 * the step was ok or where the ramp stopped). The heading and the verdict
 * line are the caller's.
 */
export function formatCapacitySummary(
  benchmark: CapacityBenchmarkResult
): string {
  const unit = benchmark.unit;
  const rate = (value: number) => `${num(value)} ${unit}/s`;
  const parts: string[] = [];

  if (benchmark.verdict === "passed" || benchmark.verdict === "failed") {
    const { headline, stoppedBy } = benchmark;
    parts.push(
      headline.limitCps === null
        ? "**Capacity limit:** none, the first step already broke a rule."
        : `**Capacity limit:** ${headline.limitIsLowerBound ? "at least " : ""}${rate(headline.limitCps)}, p99 ${num(headline.p99AtLimitMs ?? 0)} ms, ${pct(headline.failedAtLimitPct ?? 0)} failed${headline.limitIsLowerBound ? " (no step broke a rule)" : ""}.`
    );
    if (stoppedBy) {
      parts.push(
        `**Stopped at** ${rate(stoppedBy.offeredCps)}: ${ruleText(stoppedBy.rule, stoppedBy.measured, stoppedBy.limit)}.`
      );
    }
  }

  const steps = benchmark.verdict === "not-run" ? [] : benchmark.series?.steps;
  if (steps && steps.length > 0) {
    const limits =
      benchmark.verdict === "passed" || benchmark.verdict === "failed"
        ? {
            p99: benchmark.rules.find(({ id }) => id === "p99LatencyMs")?.limit,
            failed: benchmark.rules.find(({ id }) => id === "failedCallsPct")
              ?.limit
          }
        : { p99: undefined, failed: undefined };
    parts.push(
      table(
        [
          `Offered (${unit}/s)`,
          `Placed (${unit}/s)`,
          "p99",
          "Failed",
          "Result"
        ],
        steps.map((step) => [
          num(step.offeredCps),
          num(step.achievedCps),
          `${num(step.p99Ms)} ms`,
          pct(failedPct(step)),
          cell(resultOf(step, limits))
        ]),
        [true, true, true, true, false]
      )
    );
  }
  return parts.join("\n\n");
}

function failedPct(step: Step): number {
  return step.calls > 0 ? (step.failed / step.calls) * 100 : 0;
}

function resultOf(
  step: Step,
  limits: { p99: number | undefined; failed: number | undefined }
): string {
  if (!step.valid) return "invalid; stopped";
  if (limits.p99 !== undefined && step.p99Ms >= limits.p99) {
    return `stopped: p99 over ${num(limits.p99)} ms`;
  }
  if (limits.failed !== undefined && failedPct(step) >= limits.failed) {
    return `stopped: failed over ${pct(limits.failed)}`;
  }
  return "ok";
}

function ruleText(rule: string, measured: number, limit: number): string {
  return rule === "p99LatencyMs"
    ? `p99 ${num(measured)} ms, limit ${num(limit)} ms`
    : `${pct(measured)} failed, limit ${pct(limit)}`;
}
