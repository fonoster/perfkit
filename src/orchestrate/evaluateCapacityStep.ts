/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";
import {
  capacityStepWindow,
  measureCapacityStep,
  parseSamplerJsonl,
  parseUdpJsonl,
  calleeProcessNames,
  readSippResults,
  uacProcessNames
} from "../analyze/index.js";
import {
  calleeInstancesOf,
  type CapacityBenchmarkConfig,
  type LivePoint
} from "../schemas/index.js";
import { liveAnalyzeDeps } from "./liveAnalyzeDeps.js";
import type { AgentFs } from "./types.js";

export interface StepEvaluation {
  /** The progress line, like `[id] step 50 calls/s  p99 4.1 ms  ...  ok`. */
  line: string;
  /** True when the ramp ends here: the step invalid, or confirmSteps in a row broke a rule. */
  stop: boolean;
  /** True when the step broke a rule (it ends the ramp only once confirmed). */
  broken: boolean;
  /** The step's numbers for live.json; null when SIPp wrote nothing. */
  point: LivePoint | null;
}

/**
 * Evaluates one capacity step as soon as it ends, with #2's step rules, on
 * the load generator's own files: SIPp's traces, its sampler and its UDP
 * counters. The final verdict comes from the analyzer at collect; this only
 * decides where SIPp stops.
 */
export async function evaluateCapacityStep(input: {
  fs: AgentFs;
  rawDir: string;
  benchmark: CapacityBenchmarkConfig;
  index: number;
  startMs: number;
  /** How many steps just before this one broke a rule, in a row; 0 when none. */
  priorBreaks?: number;
  /** True for the last step of the ramp: a break there has no next step to wait for. */
  lastStep?: boolean;
}): Promise<StepEvaluation> {
  const { benchmark, index, rawDir } = input;
  const { start, step, every } = benchmark.load.rate;
  const everyMs = durationMs(every);
  const offeredCps = start + index * step;
  const deps = liveAnalyzeDeps(input.fs);
  const names = await input.fs.readdir(rawDir);
  const prefix = `[${benchmark.id}] step ${formatRate(offeredCps)} ${benchmark.load.unit}/s`;
  const uac = await readSippResults(
    deps,
    rawDir,
    names,
    benchmark.load.uac.scenario
  );
  if (uac === null) {
    return {
      line: `${prefix}  SIPp wrote no results; stopping`,
      stop: true,
      broken: false,
      point: null
    };
  }
  const read = async (file: string) =>
    names.includes(file) ? deps.readFile(join(rawDir, file)) : "";
  /** The first load generator's file and every worker's, as one text. */
  const readLoadgens = async (kind: "sampler" | "udp") =>
    (
      await Promise.all(
        names
          .filter((file) =>
            new RegExp(`^${kind}-(loadgen|worker-\\d+)\\.jsonl$`).test(file)
          )
          .sort()
          .map(read)
      )
    ).join("");
  const measured = measureCapacityStep({
    offeredCps,
    window: capacityStepWindow({
      startedMs: input.startMs,
      index,
      everyMs,
      warmupMs: durationMs(benchmark.warmup)
    }),
    uac,
    samples: parseSamplerJsonl(
      await readLoadgens("sampler"),
      "sampler-loadgen.jsonl"
    ),
    udp: parseUdpJsonl(await readLoadgens("udp"), "udp-loadgen.jsonl"),
    uutProcesses: [],
    uacProcesses: uacProcessNames(benchmark.load.instances),
    calleeProcesses: calleeProcessNames(calleeInstancesOf(benchmark.load)),
    unit: benchmark.load.unit
  });
  const { p99LatencyMs, failedCallsPct } = benchmark.thresholds;
  const p99 = measured.step.p99Ms;
  const numbers = `${prefix}  p99 ${p99.toFixed(1)} ms  failed ${measured.failedPct.toFixed(2)}%`;
  const invalid = measured.invalidReason !== null;
  const brokenRule =
    p99 >= p99LatencyMs
      ? "over the p99 limit"
      : measured.failedPct >= failedCallsPct
        ? "over the failed limit"
        : null;
  const broken = !invalid && brokenRule !== null;
  const confirmed =
    broken &&
    (input.lastStep === true ||
      (input.priorBreaks ?? 0) + 1 >= benchmark.thresholds.confirmSteps);
  const stop = invalid || confirmed;
  const outcome = invalid
    ? `invalid, ${measured.invalidReason}; stopping`
    : broken
      ? confirmed
        ? `${brokenRule}; stopping`
        : `${brokenRule}; a spike unless the next step breaks too`
      : "ok";
  return {
    line: `${numbers}  ${outcome}`,
    stop,
    broken,
    point: {
      offeredCps,
      achievedCps: measured.step.achievedCps,
      calls: measured.step.calls,
      failed: measured.step.failed,
      p50Ms: measured.step.p50Ms,
      p95Ms: measured.step.p95Ms,
      p99Ms: p99,
      failedPct: measured.failedPct,
      ok: !invalid && !broken,
      stopReason: stop ? outcome.replace(/; stopping$/, "") : null
    }
  };
}

function formatRate(value: number): string {
  return value.toLocaleString("en-US").padStart(5);
}

function durationMs(duration: string): number {
  const match = /^(\d+)([smh])$/.exec(duration);
  const unit = { s: 1000, m: 60_000, h: 3_600_000 };
  return match ? Number(match[1]) * unit[match[2] as keyof typeof unit] : 0;
}
