/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunEntry } from "../../schemas/index.js";

/**
 * The newest published capacity limit of a benchmark, from data/runs.json,
 * leaving out the run in progress; null when no published run has one.
 */
export function lastPublishedLimit(
  runs: readonly RunEntry[],
  benchmarkId: string,
  exceptRunId: string
): { limitCps: number; version: string } | null {
  return runs.reduce<{ limitCps: number; version: string } | null>(
    (found, run) => {
      if (found || run.id === exceptRunId) return found;
      const entry = run.benchmarks.find((b) => b.id === benchmarkId);
      return entry?.kind === "capacity" &&
        entry.headline !== null &&
        entry.headline.limitCps !== null
        ? { limitCps: entry.headline.limitCps, version: run.version }
        : null;
    },
    null
  );
}
