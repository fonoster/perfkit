/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveBenchmark } from "../../schemas/index.js";
import {
  formatCount,
  formatDuration,
  formatNumber,
  formatRate,
  formatTime
} from "../format.js";

/**
 * A progress card's second line: `held 1,700 messages/s · preliminary`,
 * `step 14 of 37 · 4,250 messages/s`, `2 h 14 min of 8 h`, `starts about
 * 14:55 UTC`.
 */
export function describeStep(benchmark: LiveBenchmark): string {
  if (benchmark.state === "queued") {
    return benchmark.estimatedStartAt
      ? `starts about ${formatTime(benchmark.estimatedStartAt)} UTC`
      : "queued";
  }
  if (benchmark.kind === "capacity") {
    if (benchmark.state === "done") {
      const result = benchmark.result;
      if (!result || result.limitCps === null)
        return "no step held · preliminary";
      return `held ${result.lowerBound ? "at least " : ""}${formatRate(result.limitCps, benchmark.unit)} · preliminary`;
    }
    return benchmark.current
      ? `step ${benchmark.current.index + 1} of ${benchmark.current.total} · ${formatRate(benchmark.current.offeredCps, benchmark.unit)}`
      : "starting the server under test";
  }
  if (benchmark.state === "done") {
    return `${formatDuration(benchmark.elapsedS)} · ${formatCount(benchmark.calls.placed)} ${benchmark.unit} · preliminary`;
  }
  if (benchmark.loadStartedAt === null) return "starting the server under test";
  const ofTotal = `${formatDuration(benchmark.elapsedS)} of ${formatDuration(benchmark.plannedS)}`;
  return benchmark.elapsedS < benchmark.warmupS
    ? `warm-up · ${ofTotal}`
    : `${ofTotal} · ${formatNumber(benchmark.cps)} ${benchmark.unit}/s`;
}
