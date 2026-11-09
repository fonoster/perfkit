/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveBenchmarkRecord, LiveRecord, LiveRecorder } from "./types.js";

/**
 * Creates the in-memory recorder the agent fills as the run goes, for the
 * live writer. It never fails and never blocks the run.
 */
export function createLiveRecorder(): LiveRecorder {
  const record: LiveRecord = {
    status: "running",
    reason: null,
    benchmarks: {}
  };
  const of = (id: string): LiveBenchmarkRecord => {
    const existing = record.benchmarks[id];
    if (existing) return existing;
    const fresh: LiveBenchmarkRecord = {
      startedMs: null,
      loadStartedMs: null,
      endedMs: null,
      points: []
    };
    record.benchmarks[id] = fresh;
    return fresh;
  };
  return {
    started: (id, ms) => {
      of(id).startedMs = ms;
    },
    loadStarted: (id, ms) => {
      of(id).loadStartedMs = ms;
    },
    point: (id, point) => {
      of(id).points.push(point);
    },
    rate: (id, cps) => {
      of(id).cps = cps;
    },
    done: (id, ms) => {
      of(id).endedMs = ms;
    },
    finished: () => {
      record.status = "finished";
    },
    failed: (reason) => {
      record.status = "failed";
      record.reason = reason;
    },
    read: () => structuredClone(record)
  };
}
