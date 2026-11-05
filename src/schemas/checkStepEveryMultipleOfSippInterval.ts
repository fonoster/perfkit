/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { durationSeconds } from "./durationSeconds.js";

/** How often SIPp writes its statistics (`-trace_stat`), in seconds. */
export const SIPP_STAT_INTERVAL_S = 10;

/**
 * Adds an issue at `load.rate.every` when a capacity step is not a whole
 * number of SIPp's 10-second statistics periods: a period would then span
 * two steps, and the step's counters would mix both rates. For use inside
 * the capacity benchmark's `superRefine`.
 */
export function checkStepEveryMultipleOfSippInterval(
  benchmark: { load: { rate: { every: string } } },
  ctx: z.core.$RefinementCtx
): void {
  const { every } = benchmark.load.rate;
  if (durationSeconds(every) % SIPP_STAT_INTERVAL_S !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["load", "rate", "every"],
      message: `expected a multiple of ${SIPP_STAT_INTERVAL_S} s (SIPp reports every ${SIPP_STAT_INTERVAL_S} s); got ${every}`,
      input: every
    });
  }
}
