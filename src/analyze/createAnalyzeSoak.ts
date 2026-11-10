/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { basename } from "node:path";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  isHelmUut,
  type SoakBenchmarkResult,
  type SoakRule,
  uutProcessNames
} from "../schemas/index.js";
import {
  type AnalyzeSoakInput,
  analyzeSoakInputSchema
} from "./analyzeSoak.schema.js";
import { computeHops } from "./computeHops.js";
import { countRestarts } from "./countRestarts.js";
import { durationToSeconds } from "./durationToSeconds.js";
import { listRawDir } from "./listRawDir.js";
import { memoryGrowthMBPerHour } from "./memoryGrowthMBPerHour.js";
import { memoryGrowthWindow } from "./memoryGrowthWindow.js";
import { nearestRank } from "./nearestRank.js";
import { parseJsonDocument } from "./parseJsonDocument.js";
import { parseOtlpSpanLines } from "./parseOtlpSpans.js";
import { readRawLines } from "./readRawLines.js";
import { parseSamplerJsonl } from "./parseSamplerJsonl.js";
import { soakMetaSchema } from "./rawResults.schema.js";
import { readRawFile } from "./readRawFile.js";
import { readSippResults } from "./readSippResults.js";
import { roundTo } from "./roundTo.js";
import { settleSeconds } from "./settleSeconds.js";
import { sumStatRows } from "./sumStatRows.js";
import { toResources } from "./toResources.js";
import type { AnalyzeDeps, Call } from "./types.js";

/** Samples after the warm-up must cover this share of the duration. */
export const MIN_COVERAGE = 0.9;
export const TOO_LITTLE_DATA_REASON =
  "ended before 90% of the planned duration after the warm-up";
export const NO_CALLS_REASON = "no calls were placed after the warm-up";

/** The reason of a soak whose uac left no -trace_rtt file. */
export function noResponseTimesReason(scenario: string): string {
  const base = basename(scenario).replace(/\.xml$/i, "");
  return `no response times from ${scenario}: SIPp wrote no ${base}_<pid>_rtt.csv, so the p99 latency can't be measured`;
}

const HOUR_MS = 3_600_000;

/**
 * Creates the soak analyzer: it reads a soak benchmark's raw results and
 * returns its report.json v1 benchmark entry.
 *
 * Everything before the warm-up ends (meta.startedAt + warmup) is left out
 * of the rules. When the unit under test's samples after the warm-up cover
 * less than 90% of `duration`, the verdict is aborted and no rule is
 * evaluated. It is aborted too when the uac started no call after the
 * warm-up (nothing was measured, so no rule can pass) or left no response
 * times file (no p99 latency). Otherwise the rules are, per process, memory growth (the
 * Theil–Sen slope of RSS in MB per hour from the end of the warm-up plus
 * the settle period to the end of the load, failing at >= the threshold),
 * failed calls (failing at >= the threshold) and restarts (failing above the
 * threshold).
 *
 * @param deps - File system access (injected)
 * @returns A validated function of `{ rawDir, benchmark }`
 */
export function createAnalyzeSoak(deps: AnalyzeDeps) {
  const fn = async ({
    rawDir,
    benchmark
  }: AnalyzeSoakInput): Promise<SoakBenchmarkResult> => {
    const names = await listRawDir(deps, rawDir);
    const read = (file: string) => readRawFile(deps, rawDir, names, file);
    const meta = parseJsonDocument(
      await read("meta.json"),
      "meta.json",
      soakMetaSchema
    );
    const samples = parseSamplerJsonl(
      await read("sampler.jsonl"),
      "sampler.jsonl"
    );
    const uutProcesses = uutProcessNames(benchmark);
    const warmupS = durationToSeconds(benchmark.warmup);
    const durationMs = durationToSeconds(benchmark.duration) * 1000;
    const warmupEndMs = Date.parse(meta.startedAt) + warmupS * 1000;
    const base = {
      id: benchmark.id,
      kind: "soak" as const,
      title: benchmark.title,
      narrative: benchmark.narrative,
      unit: benchmark.load.unit,
      durationS: meta.durationS,
      tool: meta.tool
    };
    const resources = toResources(samples, uutProcesses);

    const after = samples.filter(
      (sample) => sample.host === "uut" && sample.tMs >= warmupEndMs
    );
    const coveredMs =
      after.length > 0 ? (after.at(-1)?.tMs ?? 0) - (after[0]?.tMs ?? 0) : 0;
    if (coveredMs < durationMs * MIN_COVERAGE) {
      return {
        ...base,
        verdict: "aborted",
        reason: TOO_LITTLE_DATA_REASON,
        resources
      };
    }

    const uac = await readSippResults(
      deps,
      rawDir,
      names,
      benchmark.load.uac.scenario
    );
    if (uac === null) {
      throw new Error(
        `${rawDir}: no SIPp -trace_stat file for ${benchmark.load.uac.scenario}`
      );
    }
    const register = benchmark.load.register
      ? await readSippResults(
          deps,
          rawDir,
          names,
          benchmark.load.register.scenario
        )
      : null;
    const afterWarmup = { fromMs: warmupEndMs, toMs: Number.POSITIVE_INFINITY };
    const callSums = sumStatRows(uac.rows, afterWarmup);
    const aborted = (reason: string) => ({
      ...base,
      verdict: "aborted" as const,
      reason,
      resources
    });
    if (callSums.attempted === 0) return aborted(NO_CALLS_REASON);
    const uacBase = basename(benchmark.load.uac.scenario).replace(
      /\.xml$/i,
      ""
    );
    const hasRtt = names.some(
      (name) => name.startsWith(`${uacBase}_`) && name.endsWith("_rtt.csv")
    );
    if (!hasRtt) {
      return aborted(noResponseTimesReason(benchmark.load.uac.scenario));
    }
    const failedPct = roundTo(
      callSums.attempted > 0 ? (callSums.failed / callSums.attempted) * 100 : 0
    );
    const restarts = countRestarts(after, uutProcesses, {
      fromCounters: isHelmUut(benchmark.uut)
    });
    const { thresholds } = benchmark;

    const settleS = settleSeconds(benchmark);
    const window = memoryGrowthWindow({
      warmupEndMs,
      settleS,
      loadEndMs: Math.min(
        Date.parse(meta.endedAt),
        after.at(-1)?.tMs ?? warmupEndMs
      )
    });
    const growthWindow = {
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString()
    };
    const growth = uutProcesses.map((name) => ({
      name,
      slope: memoryGrowthMBPerHour(after, name, window)
    }));
    const rules: SoakRule[] = [
      ...growth.map<SoakRule>(({ name, slope }) => ({
        id: "memoryGrowthMBPerHour",
        process: name,
        limit: thresholds.memoryGrowthMBPerHour,
        measured: slope,
        passed: slope < thresholds.memoryGrowthMBPerHour,
        window: growthWindow
      })),
      {
        id: "failedCallsPct",
        limit: thresholds.failedCallsPct,
        measured: failedPct,
        passed: failedPct < thresholds.failedCallsPct
      },
      {
        id: "restarts",
        limit: thresholds.restarts,
        measured: restarts,
        passed: restarts <= thresholds.restarts
      }
    ];

    const calls = uac.calls.filter((call) => call.sentMs >= warmupEndMs);
    const lastSentMs = calls.reduce(
      (max, call) => Math.max(max, call.sentMs),
      warmupEndMs
    );
    const hops = benchmark.telemetry.otlp
      ? computeHops(
          await parseOtlpSpanLines(
            await readRawLines(deps, rawDir, names, "spans.jsonl"),
            "spans.jsonl"
          ),
          benchmark.telemetry.sampleRatio,
          warmupEndMs
        )
      : undefined;

    return {
      ...base,
      verdict: rules.every((rule) => rule.passed) ? "passed" : "failed",
      reason: null,
      warmupS,
      settleS,
      load: meta.load,
      rules,
      headline: {
        memoryGrowthMBPerHour: Math.max(...growth.map(({ slope }) => slope)),
        calls: callSums.attempted,
        registrations: meta.registerUsers,
        registerFailures: register
          ? sumStatRows(register.rows, afterWarmup).failed
          : 0
      },
      reported: {
        p99FirstHourMs: p99Between(calls, warmupEndMs, warmupEndMs + HOUR_MS),
        p99LastHourMs: p99Between(calls, lastSentMs - HOUR_MS, lastSentMs + 1),
        maxOpenFds: Object.fromEntries(
          uutProcesses.map((name) => [
            name,
            after
              .filter((sample) => sample.name === name)
              .reduce((max, sample) => Math.max(max, sample.fds), 0)
          ])
        ),
        maxConcurrentCalls: callSums.maxCurrentCalls
      },
      resources,
      ...(hops ? { hops } : {})
    };
  };

  return withErrorHandlingAndValidation(fn, analyzeSoakInputSchema);
}

/** p99 of the calls sent in [fromMs, toMs). */
function p99Between(calls: readonly Call[], fromMs: number, toMs: number) {
  return roundTo(
    nearestRank(
      calls
        .filter((call) => call.sentMs >= fromMs && call.sentMs < toMs)
        .map((call) => call.latencyMs),
      99
    )
  );
}
