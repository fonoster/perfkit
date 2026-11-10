/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { durationSeconds } from "./durationSeconds.js";

/**
 * Adds an issue at `settle` when a soak's settle period is not shorter than
 * its `duration`: memory growth would have no samples left to fit. No
 * issue without one (the default fits any duration). For use
 * inside the soak benchmark's `superRefine`.
 */
export function checkSettleShorterThanDuration(
  benchmark: { settle?: string | undefined; duration: string },
  ctx: z.core.$RefinementCtx
): void {
  if (benchmark.settle === undefined) return;
  if (durationSeconds(benchmark.settle) >= durationSeconds(benchmark.duration)) {
    ctx.addIssue({
      code: "custom",
      path: ["settle"],
      message: `expected a settle period shorter than duration (${benchmark.duration})`,
      input: benchmark.settle
    });
  }
}
