/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";

/**
 * Adds an issue at `[index, "load", "rate", "fromCapacity"]` for every soak
 * whose rate names a benchmark that is not a capacity benchmark of the same
 * file. For use inside the benchmarks array's `superRefine`.
 */
export function checkFromCapacity(
  benchmarks: ReadonlyArray<{
    id: string;
    kind: string;
    load: { rate: object };
  }>,
  ctx: z.core.$RefinementCtx
): void {
  const capacities = benchmarks
    .filter(({ kind }) => kind === "capacity")
    .map(({ id }) => id);
  benchmarks.forEach((benchmark, index) => {
    const rate = benchmark.load.rate as { fromCapacity?: string };
    if (benchmark.kind !== "soak" || rate.fromCapacity === undefined) return;
    if (capacities.includes(rate.fromCapacity)) return;
    ctx.addIssue({
      code: "custom",
      path: [index, "load", "rate", "fromCapacity"],
      message:
        capacities.length === 0
          ? `expected the id of a capacity benchmark, and this file has none; got ${JSON.stringify(rate.fromCapacity)}`
          : `expected the id of a capacity benchmark (${capacities.join(", ")}); got ${JSON.stringify(rate.fromCapacity)}`,
      input: rate.fromCapacity
    });
  });
}
