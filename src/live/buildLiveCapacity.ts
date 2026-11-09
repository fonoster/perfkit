/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import type {
  CapacityBenchmarkConfig,
  LiveCapacity
} from "../schemas/index.js";
import { liveStateOf } from "./liveStateOf.js";
import type { LiveBenchmarkRecord } from "./types.js";

const iso = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toISOString();

/**
 * A capacity benchmark's entry in live.json: the step SIPp offers now (from
 * the clock, as SIPp steps it), the steps the agent evaluated with the
 * same rules that stop the ramp, the last step that held, and once done
 * where the ramp ended. Nothing here is a verdict.
 */
export function buildLiveCapacity(input: {
  benchmark: CapacityBenchmarkConfig;
  record: LiveBenchmarkRecord | undefined;
  selected: boolean;
  nowMs: number;
  estimatedStartMs: number | null;
}): LiveCapacity {
  const { benchmark, record, nowMs } = input;
  const { start, step, every, max } = benchmark.load.rate;
  const everyS = durationToSeconds(every);
  const total = Math.floor((max - start) / step) + 1;
  const state = liveStateOf(input.selected, record);
  const points = record?.points ?? [];
  // A step that broke a rule but did not stop the ramp is a spike: it neither
  // ends the ramp nor counts as held
  const firstStop = points.findIndex(
    (point) => !point.ok && point.stopReason !== null
  );
  const passed = (
    firstStop === -1 ? points : points.slice(0, firstStop)
  ).filter((point) => point.ok);
  const heldCps = passed.at(-1)?.offeredCps ?? null;
  const loadStartedMs = record?.loadStartedMs ?? null;
  const index =
    firstStop !== -1
      ? firstStop
      : Math.min(
          total - 1,
          Math.max(
            0,
            Math.floor((nowMs - (loadStartedMs ?? nowMs)) / (everyS * 1000))
          )
        );
  return {
    id: benchmark.id,
    kind: "capacity",
    title: benchmark.title,
    unit: benchmark.load.unit,
    state,
    startedAt: iso(record?.startedMs),
    loadStartedAt: iso(loadStartedMs),
    estimatedStartAt: state === "queued" ? iso(input.estimatedStartMs) : null,
    plannedS: total * everyS,
    rate: { start, step, everyS, max },
    thresholds: { ...benchmark.thresholds },
    current:
      state === "running" && loadStartedMs !== null
        ? { index, total, offeredCps: start + index * step }
        : null,
    points,
    heldCps,
    result:
      state === "done"
        ? {
            limitCps: heldCps,
            lowerBound: points.length > 0 && firstStop === -1,
            stopReason:
              firstStop === -1 ? null : (points[firstStop]?.stopReason ?? null)
          }
        : null
  };
}
