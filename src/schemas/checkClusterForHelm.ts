/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";

/**
 * Adds a `required` issue at `infra.cluster` when a benchmark has
 * `uut.helm` and the file has no cluster to install it on. For use inside
 * the config's `superRefine`.
 */
export function checkClusterForHelm(
  config: {
    infra: { cluster?: unknown };
    benchmarks: ReadonlyArray<{ id: string; uut: object }>;
  },
  ctx: z.core.$RefinementCtx
): void {
  if (config.infra.cluster !== undefined) return;
  const helm = config.benchmarks.filter(({ uut }) => "helm" in uut);
  if (helm.length === 0) return;
  ctx.addIssue({
    code: "custom",
    path: ["infra", "cluster"],
    message: `required: ${helm.map(({ id }) => id).join(", ")} ${helm.length === 1 ? "has" : "have"} uut.helm`,
    input: undefined
  });
}
