/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/** The cluster sampler's spec: `name<TAB>label selector` per line. */
export function buildKubeSamplerSpec(
  pods: ReadonlyArray<{ name: string; selector: string }>
): string {
  return pods.map(({ name, selector }) => `${name}\t${selector}\n`).join("");
}
