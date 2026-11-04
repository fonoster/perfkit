/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { type RunEntry, type Runs, SCHEMA_IDS } from "../schemas/index.js";

/**
 * Inserts a run into the history at its `startedAt` position, newest first.
 * A run with the same id is replaced, so merging the same run twice lists it
 * once. With no history, the index starts with this run.
 */
export function mergeRuns(
  history: Runs | null,
  entry: RunEntry,
  project: string
): Runs {
  const others = (history?.runs ?? []).filter((run) => run.id !== entry.id);
  const startedAt = Date.parse(entry.startedAt);
  const index = others.findIndex(
    (run) => Date.parse(run.startedAt) < startedAt
  );
  const at = index === -1 ? others.length : index;
  return {
    schema: SCHEMA_IDS.runs,
    project: history?.project ?? project,
    runs: [...others.slice(0, at), entry, ...others.slice(at)]
  };
}
