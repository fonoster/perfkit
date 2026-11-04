/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunBenchmark, RunEntry } from "../schemas/index.js";

export interface EarlierResult<T> {
  run: RunEntry;
  value: T;
}

/**
 * The most recent run that started before `before` and has a value for one
 * benchmark, as `pick` reads it from that benchmark's runs.json entry. `pick`
 * returns null when the run has no such value (not measured, no limit).
 */
export function findEarlierResult<T>(
  runs: ReadonlyArray<RunEntry>,
  before: RunEntry,
  benchmarkId: string,
  pick: (benchmark: RunBenchmark) => T | null
): EarlierResult<T> | null {
  const startedAt = Date.parse(before.startedAt);
  return runs
    .filter(
      (run) => run.id !== before.id && Date.parse(run.startedAt) < startedAt
    )
    .reduce<EarlierResult<T> | null>((found, run) => {
      if (found) return found;
      const benchmark = run.benchmarks.find((b) => b.id === benchmarkId);
      const value = benchmark ? pick(benchmark) : null;
      return value === null ? null : { run, value };
    }, null);
}
