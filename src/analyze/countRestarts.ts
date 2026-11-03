/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { ProcessSample } from "./types.js";

/**
 * Counts restarts of the configured processes on the unit under test. The
 * sampler's ticks are the distinct sample times. For each process, a pid
 * that differs from its previous sample counts 1, and so does a tick where
 * the process is missing; a run of missing ticks counts once, and the new pid
 * it comes back with is not counted again.
 */
export function countRestarts(
  samples: readonly ProcessSample[],
  processNames: readonly string[]
): number {
  const uut = samples.filter((sample) => sample.host === "uut");
  const ticks = [...new Set(uut.map((sample) => sample.tMs))].sort(
    (a, b) => a - b
  );
  return processNames.reduce((total, name) => {
    const pidAt = new Map(
      uut
        .filter((sample) => sample.name === name)
        .map((sample) => [sample.tMs, sample.pid])
    );
    const { restarts } = ticks.reduce(
      (state, tick) => {
        const pid = pidAt.get(tick);
        if (pid === undefined) {
          return {
            previousPid: state.previousPid,
            missing: true,
            restarts: state.missing ? state.restarts : state.restarts + 1
          };
        }
        const changed =
          !state.missing &&
          state.previousPid !== undefined &&
          state.previousPid !== pid;
        return {
          previousPid: pid,
          missing: false,
          restarts: changed ? state.restarts + 1 : state.restarts
        };
      },
      {
        previousPid: undefined as number | undefined,
        missing: false,
        restarts: 0
      }
    );
    return total + restarts;
  }, 0);
}
