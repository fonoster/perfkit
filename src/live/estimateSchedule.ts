/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { plannedSeconds } from "../orchestrate/createAgent.js";
import type { BenchmarkConfig } from "../schemas/index.js";
import { BENCHMARK_OVERHEAD_S } from "./constants.js";
import type { LiveBenchmarkRecord } from "./types.js";

/**
 * When each benchmark still to run is expected to start, and when the run
 * is expected to end, from the clock: the running benchmark's planned load
 * time left, then each queued one's planned time, each with a fixed
 * allowance for compose up, setup and teardown. A capacity ramp that has
 * stopped is about to end.
 */
export function estimateSchedule(input: {
  /** The selected benchmarks, in the order the agent runs them. */
  benchmarks: readonly BenchmarkConfig[];
  records: Readonly<Record<string, LiveBenchmarkRecord>>;
  nowMs: number;
}): { startsMs: Map<string, number>; endMs: number } {
  const overheadMs = BENCHMARK_OVERHEAD_S * 1000;
  return input.benchmarks.reduce(
    (acc, benchmark) => {
      const record = input.records[benchmark.id];
      const plannedMs = plannedSeconds(benchmark) * 1000;
      if (record?.endedMs != null) return acc;
      if (record?.startedMs != null) {
        const stopped = record.points.some((point) => !point.ok);
        const leftMs =
          record.loadStartedMs == null
            ? plannedMs + overheadMs
            : stopped
              ? overheadMs / 3
              : Math.max(0, record.loadStartedMs + plannedMs - input.nowMs) +
                overheadMs / 3;
        return { ...acc, endMs: acc.endMs + leftMs };
      }
      acc.startsMs.set(benchmark.id, acc.endMs);
      return { ...acc, endMs: acc.endMs + plannedMs + overheadMs };
    },
    { startsMs: new Map<string, number>(), endMs: input.nowMs }
  );
}
