/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";

/**
 * Adds a `duplicate id` issue at `[index, "id"]` for every item whose id an
 * earlier item already used. For use inside an array's `superRefine`.
 */
export function checkUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  ctx: z.core.$RefinementCtx
): void {
  items.forEach((item, index) => {
    const first = items.findIndex((other) => other.id === item.id);
    if (first !== index) {
      ctx.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `duplicate id ${JSON.stringify(item.id)}; benchmarks[${first}] already uses it`,
        input: item.id
      });
    }
  });
}
