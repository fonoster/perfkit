/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { UutConfig } from "./perfkitConfig.schema.js";

/**
 * The names the sampler reports the unit under test under, in perfkit.yaml
 * order: `uut.processes` on the server, `uut.helm.pods` on the cluster.
 */
export function uutProcessNames(benchmark: { uut: UutConfig }): string[] {
  const { uut } = benchmark;
  return "helm" in uut
    ? uut.helm.pods.map(({ name }) => name)
    : uut.processes.map(({ name }) => name);
}
