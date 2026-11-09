/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * How many callee SIPp processes a benchmark runs: as many as `instances`
 * when it has a `register` scenario (each registers its share of the users),
 * else one: a uas alone answers on one address and has nothing to split.
 */
export function calleeInstancesOf(load: {
  instances: number;
  register?: unknown;
}): number {
  return load.register ? load.instances : 1;
}
