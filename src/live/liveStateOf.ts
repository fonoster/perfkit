/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveBenchmarkState } from "../schemas/index.js";
import type { LiveBenchmarkRecord } from "./types.js";

/** not-run when not selected; else done, running or queued by the record. */
export function liveStateOf(
  selected: boolean,
  record: LiveBenchmarkRecord | undefined
): LiveBenchmarkState {
  if (!selected) return "not-run";
  if (record?.endedMs != null) return "done";
  if (record?.startedMs != null) return "running";
  return "queued";
}
