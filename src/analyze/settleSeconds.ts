/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "./durationToSeconds.js";

/** The settle period when a soak sets none, s. */
export const DEFAULT_SETTLE_S = 1800;

/**
 * How long a soak's memory growth ignores after the warm-up, s: its
 * `settle`, or by default 30 minutes, or half of `duration` when that is
 * shorter, so a short smoke soak still has samples to fit.
 */
export function settleSeconds(benchmark: {
  settle?: string | undefined;
  duration: string;
}): number {
  return benchmark.settle === undefined
    ? Math.min(DEFAULT_SETTLE_S, durationToSeconds(benchmark.duration) / 2)
    : durationToSeconds(benchmark.settle);
}
