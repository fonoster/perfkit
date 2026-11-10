/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { leastSquaresSlope } from "./leastSquaresSlope.js";
import { roundTo } from "./roundTo.js";
import type { ProcessSample } from "./types.js";

const HOUR_MS = 3_600_000;

/**
 * One process's memory growth: the least-squares slope of its RSS in MB per
 * hour over the samples in `[fromMs, toMs]`, rounded as the report rounds
 * it. The soak verdict and the live page both pass the second half of the
 * window after the warm-up (`secondHalfWindow`).
 */
export function memoryGrowthMBPerHour(
  samples: ReadonlyArray<Pick<ProcessSample, "name" | "tMs" | "rssKB">>,
  name: string,
  window: { fromMs: number; toMs: number }
): number {
  return roundTo(
    leastSquaresSlope(
      samples
        .filter(
          (sample) =>
            sample.name === name &&
            sample.tMs >= window.fromMs &&
            sample.tMs <= window.toMs
        )
        .map((sample) => ({
          x: (sample.tMs - window.fromMs) / HOUR_MS,
          y: sample.rssKB / 1024
        }))
    )
  );
}
