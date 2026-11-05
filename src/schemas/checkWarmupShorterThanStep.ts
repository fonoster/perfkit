/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { durationSeconds } from "./durationSeconds.js";

/**
 * Adds an issue at `warmup` when a capacity benchmark's warm-up is not
 * shorter than one step (`load.rate.every`): the first step would have
 * nothing left to measure. A `0s` warm-up is always fine. For use inside the
 * capacity benchmark's `superRefine`.
 */
export function checkWarmupShorterThanStep(
  benchmark: { warmup: string; load: { rate: { every: string } } },
  ctx: z.core.$RefinementCtx
): void {
  const warmupS = durationSeconds(benchmark.warmup);
  const everyS = durationSeconds(benchmark.load.rate.every);
  if (warmupS > 0 && warmupS >= everyS) {
    ctx.addIssue({
      code: "custom",
      path: ["warmup"],
      message: `expected a warm-up shorter than load.rate.every (${benchmark.load.rate.every})`,
      input: benchmark.warmup
    });
  }
}
