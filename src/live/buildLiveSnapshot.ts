/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunState } from "../orchestrate/runState.schema.js";
import { toReportProject } from "../orchestrate/toReportProject.js";
import { LIVE_SCHEMA_ID, type Live } from "../schemas/index.js";
import { buildLiveCapacity } from "./buildLiveCapacity.js";
import { buildLiveSoak } from "./buildLiveSoak.js";
import { estimateSchedule } from "./estimateSchedule.js";
import type { LiveRecord, SoakProgress } from "./types.js";

/**
 * The run's live.json from its state, what the agent recorded so far and
 * each soak's progress: every benchmark of perfkit.yaml in its order, one
 * not selected as not-run, and the expected end while the run goes on.
 */
export function buildLiveSnapshot(input: {
  state: RunState;
  record: LiveRecord;
  nowMs: number;
  soaks: ReadonlyMap<string, SoakProgress>;
}): Live {
  const { state, record, nowMs } = input;
  const { plan, config } = state;
  const selected = new Set(plan.benchmarks.map(({ id }) => id));
  const schedule = estimateSchedule({
    benchmarks: plan.benchmarks,
    records: record.benchmarks,
    nowMs
  });
  const running = record.status === "running";
  const benchmarks = config.benchmarks.map((benchmark) => {
    const common = {
      record: record.benchmarks[benchmark.id],
      selected: selected.has(benchmark.id),
      nowMs,
      estimatedStartMs: running
        ? (schedule.startsMs.get(benchmark.id) ?? null)
        : null
    };
    return benchmark.kind === "capacity"
      ? buildLiveCapacity({ ...common, benchmark })
      : buildLiveSoak({
          ...common,
          benchmark,
          progress: input.soaks.get(benchmark.id) ?? null
        });
  });
  return {
    schema: LIVE_SCHEMA_ID,
    runId: plan.runId,
    version: plan.targetVersion,
    commit: plan.commit,
    startedAt: plan.startedAt,
    updatedAt: new Date(nowMs).toISOString(),
    status: record.status,
    reason: record.reason,
    estimatedEndAt: running ? new Date(schedule.endMs).toISOString() : null,
    provider: state.mode,
    project: toReportProject(state),
    benchmarks
  };
}
