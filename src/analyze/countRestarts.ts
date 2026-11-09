/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { ProcessSample } from "./types.js";

/**
 * Counts restarts of the configured processes on the unit under test. The
 * sampler's ticks are the distinct sample times. A name can match several
 * processes, like a database server and its connections; it restarted when
 * none of the pids of its previous sample is still there, so connections
 * that come and go are not restarts while the server stays. For one process
 * that is a pid change. A tick where the process is missing counts 1; a run
 * of missing ticks counts once, and the pids it comes back with are not
 * counted again.
 *
 * On the cluster (`fromCounters`) a name's `pid` is 1 plus the restarts its
 * pods' counters show (see `toKubeSamplerLines`), so the restarts are the
 * rises of the pid, and a tick with no sample (the metrics API had no usage
 * yet) is not a restart: only a counter says a pod restarted.
 */
export function countRestarts(
  samples: readonly ProcessSample[],
  processNames: readonly string[],
  options: { fromCounters?: boolean } = {}
): number {
  const uut = samples.filter((sample) => sample.host === "uut");
  if (options.fromCounters) {
    return processNames.reduce((total, name) => {
      const pids = uut
        .filter((sample) => sample.name === name)
        .sort((a, b) => a.tMs - b.tMs)
        .map((sample) => sample.pid);
      return (
        total +
        pids.reduce(
          (sum, pid, index) =>
            index === 0
              ? sum
              : sum + Math.max(0, pid - (pids[index - 1] ?? pid)),
          0
        )
      );
    }, 0);
  }
  const ticks = [...new Set(uut.map((sample) => sample.tMs))].sort(
    (a, b) => a - b
  );
  return processNames.reduce((total, name) => {
    const pidsAt = uut
      .filter((sample) => sample.name === name)
      .reduce((map, sample) => {
        const pids = map.get(sample.tMs) ?? new Set<number>();
        pids.add(sample.pid);
        return map.set(sample.tMs, pids);
      }, new Map<number, Set<number>>());
    const { restarts } = ticks.reduce(
      (state, tick) => {
        const pids = pidsAt.get(tick);
        if (pids === undefined) {
          return {
            previous: state.previous,
            missing: true,
            restarts: state.missing ? state.restarts : state.restarts + 1
          };
        }
        const changed =
          !state.missing &&
          state.previous !== undefined &&
          ![...state.previous].some((pid) => pids.has(pid));
        return {
          previous: pids,
          missing: false,
          restarts: changed ? state.restarts + 1 : state.restarts
        };
      },
      {
        previous: undefined as Set<number> | undefined,
        missing: false,
        restarts: 0
      }
    );
    return total + restarts;
  }, 0);
}
