/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { leastSquaresSlope } from "./leastSquaresSlope.js";
import { roundTo } from "./roundTo.js";
import type { ProcessSample } from "./types.js";

const HOUR_MS = 3_600_000;

/**
 * One process's memory growth after the warm-up: the least-squares slope of
 * its RSS in MB per hour over the samples from `warmupEndMs` on, rounded as
 * the report rounds it. The soak verdict and the live page both use it.
 */
export function memoryGrowthMBPerHour(
  samples: ReadonlyArray<Pick<ProcessSample, "name" | "tMs" | "rssKB">>,
  name: string,
  warmupEndMs: number
): number {
  return roundTo(
    leastSquaresSlope(
      samples
        .filter((sample) => sample.name === name && sample.tMs >= warmupEndMs)
        .map((sample) => ({
          x: (sample.tMs - warmupEndMs) / HOUR_MS,
          y: sample.rssKB / 1024
        }))
    )
  );
}
