/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  BenchmarkResult,
  CapacityBenchmarkConfig
} from "../schemas/index.js";

/** A capacity benchmark's limit, for a soak's `rate.fromCapacity`. */
export interface CapacityLimit {
  cps: number;
  /** True when the server can take more: the ramp ended for another reason. */
  lowerBound: boolean;
}

/**
 * The limit a capacity result gives a soak's rate: a passed benchmark's
 * limit; for one inconclusive because the load generator, not the server,
 * gave out, the highest step before the invalid one, as a lower bound, when
 * every measured step up to it passed both rules. Null for a failed,
 * aborted or not-run benchmark, or an inconclusive one without such a step.
 */
export function capacityLimitOf(
  result: BenchmarkResult | null,
  thresholds: Pick<
    CapacityBenchmarkConfig["thresholds"],
    "p99LatencyMs" | "failedCallsPct"
  >
): CapacityLimit | null {
  if (result === null || result.kind !== "capacity") return null;
  if (result.verdict === "passed") {
    return result.headline.limitCps === null
      ? null
      : {
          cps: result.headline.limitCps,
          lowerBound: result.headline.limitIsLowerBound
        };
  }
  if (result.verdict !== "inconclusive" || !result.series) return null;
  const steps = result.series.steps;
  const invalid = steps.findIndex(({ valid }) => !valid);
  const measured = invalid === -1 ? steps : steps.slice(0, invalid);
  const passed = measured.every(
    (step) =>
      step.spike === true ||
      (step.p99Ms < thresholds.p99LatencyMs &&
        (step.calls > 0 ? (step.failed / step.calls) * 100 : 0) <
          thresholds.failedCallsPct)
  );
  const last = measured.at(-1);
  return passed && last ? { cps: last.offeredCps, lowerBound: true } : null;
}
