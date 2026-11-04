/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  BenchmarkResult,
  CapacityBenchmarkResult,
  SoakBenchmarkResult
} from "../schemas/index.js";

type Measured<T> = Extract<T, { verdict: "passed" | "failed" }>;

const number = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** One benchmark's verdict as `collect` prints it. */
export function formatResultLine(result: BenchmarkResult): string {
  const head = `[${result.id}]`;
  if (result.verdict === "not-run") return `${head} not run: ${result.reason}`;
  if (result.verdict === "inconclusive" || result.verdict === "aborted") {
    return `${head} ${result.verdict}: ${result.reason}`;
  }
  if (result.kind === "capacity") {
    const capacity = result as Measured<CapacityBenchmarkResult>;
    const { limitCps, limitIsLowerBound } = capacity.headline;
    if (limitCps === null) {
      return `${head} ${result.verdict}: the first step already broke a rule`;
    }
    return `${head} ${result.verdict}: limit ${limitIsLowerBound ? "at least " : ""}${number(limitCps)} ${result.unit}/s`;
  }
  const soak = result as Measured<SoakBenchmarkResult>;
  const memory = soak.rules
    .flatMap((rule) =>
      rule.id === "memoryGrowthMBPerHour"
        ? [
            `${rule.process} ${rule.measured >= 0 ? "+" : ""}${number(rule.measured)} MB/h`
          ]
        : []
    )
    .join(", ");
  const failed = soak.rules.find((rule) => rule.id === "failedCallsPct");
  const restarts = soak.rules.find((rule) => rule.id === "restarts");
  return `${head} ${result.verdict}: memory ${memory}; failed ${result.unit} ${number(failed?.measured ?? 0)}%; restarts ${restarts?.measured ?? 0}`;
}

/** `3h12m`, `45m`, `30s`. */
export function formatSpan(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** `5h50m`, `90m`, `30s`, `1h` in ms; null when it is not one. */
export function parseSpan(text: string): number | null {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim());
  if (!match || text.trim() === "") return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000;
}
