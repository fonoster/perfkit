/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import { memoryGrowthMBPerHour } from "../analyze/memoryGrowthMBPerHour.js";
import { secondHalfWindow } from "../analyze/secondHalfWindow.js";
import {
  LIVE_MAX_SAMPLES,
  type LiveSoak,
  type SoakBenchmarkConfig,
  uutProcessNames
} from "../schemas/index.js";
import { downsample } from "./downsample.js";
import { liveStateOf } from "./liveStateOf.js";
import type { LiveBenchmarkRecord, SoakProgress } from "./types.js";

const HOUR_MS = 3_600_000;
const iso = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toISOString();

/**
 * A soak's entry in live.json: how far it is, the calls so far, and each
 * process's raw memory, at most 300 samples. Growth in MB/h, the same
 * least-squares slope as the verdict (over the second half of the samples
 * after the warm-up so far), appears only once there is a full hour of
 * samples after the warm-up: over minutes it overstates growth while the
 * heap settles.
 */
export function buildLiveSoak(input: {
  benchmark: SoakBenchmarkConfig;
  record: LiveBenchmarkRecord | undefined;
  selected: boolean;
  nowMs: number;
  estimatedStartMs: number | null;
  progress: SoakProgress | null;
}): LiveSoak {
  const { benchmark, record, progress } = input;
  const warmupS = durationToSeconds(benchmark.warmup);
  const durationS = durationToSeconds(benchmark.duration);
  const plannedS = warmupS + durationS;
  const state = liveStateOf(input.selected, record);
  const loadStartedMs = record?.loadStartedMs ?? null;
  const untilMs = record?.endedMs ?? input.nowMs;
  const elapsedS =
    loadStartedMs === null
      ? 0
      : Math.min(
          plannedS,
          Math.max(0, Math.round((untilMs - loadStartedMs) / 1000))
        );
  const warmupEndMs =
    loadStartedMs === null ? null : loadStartedMs + warmupS * 1000;
  const samples = progress?.samples ?? [];
  const memory = uutProcessNames(benchmark).map((name) => {
    const own = samples.filter((sample) => sample.name === name);
    const last = own.at(-1);
    const hourAfterWarmup =
      warmupEndMs !== null &&
      last !== undefined &&
      last.tMs - warmupEndMs >= HOUR_MS;
    return {
      name,
      samples: downsample(own, LIVE_MAX_SAMPLES).map((sample) => ({
        t: new Date(sample.tMs).toISOString(),
        rssMB: Math.round((sample.rssKB / 1024) * 10) / 10
      })),
      growthMBPerHour:
        hourAfterWarmup && warmupEndMs !== null
          ? memoryGrowthMBPerHour(
              own,
              name,
              secondHalfWindow(warmupEndMs, last.tMs)
            )
          : null
    };
  });
  return {
    id: benchmark.id,
    kind: "soak",
    title: benchmark.title,
    unit: benchmark.load.unit,
    state,
    startedAt: iso(record?.startedMs),
    loadStartedAt: iso(loadStartedMs),
    estimatedStartAt: state === "queued" ? iso(input.estimatedStartMs) : null,
    plannedS,
    cps:
      record?.cps ??
      ("cps" in benchmark.load.rate
        ? benchmark.load.rate.cps
        : benchmark.load.rate.fallbackCps),
    warmupS,
    durationS,
    elapsedS,
    thresholds: {
      memoryGrowthMBPerHour: benchmark.thresholds.memoryGrowthMBPerHour,
      failedCallsPct: benchmark.thresholds.failedCallsPct
    },
    calls: { placed: progress?.placed ?? 0, failed: progress?.failed ?? 0 },
    memory
  };
}
