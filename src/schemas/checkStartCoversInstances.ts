/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";

/**
 * Adds an issue at `load.rate.start` when a capacity benchmark starts below
 * the number of SIPp instances: the rate is split among them in whole
 * numbers, so an instance would get none. For use inside the capacity
 * benchmark's `superRefine`.
 */
export function checkStartCoversInstances(
  benchmark: { load: { instances: number; rate: { start: number } } },
  ctx: z.core.$RefinementCtx
): void {
  const { instances, rate } = benchmark.load;
  if (rate.start < instances) {
    ctx.addIssue({
      code: "custom",
      path: ["load", "rate", "start"],
      message: `expected a starting rate of ${instances} or more, one for each of the ${instances} SIPp instances`,
      input: rate.start
    });
  }
}
