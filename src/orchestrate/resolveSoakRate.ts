/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RateSource } from "../analyze/rawResults.schema.js";
import type { SoakBenchmarkConfig } from "../schemas/index.js";

export interface ResolvedSoakRate {
  cps: number;
  rateSource: RateSource;
  /** The progress line, like `[k8s-soak] rate 1,500 calls/s: ...`. */
  line: string;
}

/**
 * The rate of a soak with `rate.fromCapacity`: `fraction ×` the limit that
 * capacity benchmark measured in this run, rounded down. `fallbackCps` when
 * it found no limit (failed, inconclusive, aborted) or did not run, or when
 * the fraction rounds down to 0. Null for a soak with a fixed `cps`.
 *
 * @param limits - Each capacity benchmark run so far, with its limit or null
 */
export function resolveSoakRate(
  benchmark: SoakBenchmarkConfig,
  limits: ReadonlyMap<string, number | null>
): ResolvedSoakRate | null {
  const { rate, unit } = benchmark.load;
  if ("cps" in rate) return null;
  const limit = limits.get(rate.fromCapacity) ?? null;
  const derived = limit === null ? 0 : Math.floor(rate.fraction * limit);
  const n = (value: number) => value.toLocaleString("en-US");
  const rateSource = {
    fromCapacity: rate.fromCapacity,
    limit,
    fraction: rate.fraction
  };
  if (derived >= 1 && limit !== null) {
    return {
      cps: derived,
      rateSource,
      line: `[${benchmark.id}] rate ${n(derived)} ${unit}/s: ${rate.fraction} × the limit of ${rate.fromCapacity} (${n(limit)} ${unit}/s)`
    };
  }
  const why =
    limit !== null
      ? `${rate.fraction} × the limit of ${rate.fromCapacity} (${n(limit)} ${unit}/s) is under 1`
      : limits.has(rate.fromCapacity)
        ? `${rate.fromCapacity} found no limit`
        : `${rate.fromCapacity} did not run`;
  return {
    cps: rate.fallbackCps,
    rateSource,
    line: `[${benchmark.id}] rate ${n(rate.fallbackCps)} ${unit}/s (fallbackCps): ${why}`
  };
}
