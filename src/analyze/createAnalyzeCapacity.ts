/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  type CapacityBenchmarkResult,
  type CapacityRule,
  type StoppedBy,
  uutProcessNames
} from "../schemas/index.js";
import {
  type AnalyzeCapacityInput,
  analyzeCapacityInputSchema
} from "./analyzeCapacity.schema.js";
import { computeHops } from "./computeHops.js";
import { listRawDir } from "./listRawDir.js";
import {
  type MeasuredStep,
  measureCapacityStep,
  uacProcessNames
} from "./measureCapacityStep.js";
import { parseJsonDocument } from "./parseJsonDocument.js";
import { parseOtlpSpanLines } from "./parseOtlpSpans.js";
import { readRawLines } from "./readRawLines.js";
import { parseSamplerJsonl } from "./parseSamplerJsonl.js";
import { parseUdpJsonl } from "./parseUdpJsonl.js";
import { capacityMetaSchema } from "./rawResults.schema.js";
import { readRawFile } from "./readRawFile.js";
import { readSippResults } from "./readSippResults.js";
import { roundTo } from "./roundTo.js";
import { toResources } from "./toResources.js";
import type { AnalyzeDeps } from "./types.js";

/**
 * Creates the capacity analyzer: it reads a capacity benchmark's raw results
 * and returns its report.json v1 benchmark entry.
 *
 * Steps are checked in order. A step whose measurement does not count (the
 * load generator saturated) makes the verdict inconclusive. Otherwise a step
 * passes when p99 < p99LatencyMs and failed % < failedCallsPct, both strict;
 * the first step that breaks a rule ends the ramp. The limit is the offered
 * rate of the last step that passed, and the rules are reported at it, or at
 * the first step when none passed. When no step broke a rule the limit is a
 * lower bound.
 *
 * @param deps - File system access (injected)
 * @returns A validated function of `{ rawDir, benchmark }`
 */
export function createAnalyzeCapacity(deps: AnalyzeDeps) {
  const fn = async ({
    rawDir,
    benchmark
  }: AnalyzeCapacityInput): Promise<CapacityBenchmarkResult> => {
    const names = await listRawDir(deps, rawDir);
    const read = (file: string) => readRawFile(deps, rawDir, names, file);
    const meta = parseJsonDocument(
      await read("meta.json"),
      "meta.json",
      capacityMetaSchema
    );
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
    const samples = parseSamplerJsonl(
      await read("sampler.jsonl"),
      "sampler.jsonl"
    );
    const udp = parseUdpJsonl(await read("udp.jsonl"), "udp.jsonl");
    const uutProcesses = uutProcessNames(benchmark);
    const { p99LatencyMs, failedCallsPct } = benchmark.thresholds;
    const unit = benchmark.load.unit;

    const measured = meta.steps.map((step) =>
      measureCapacityStep({
        offeredCps: step.offeredCps,
        window: { fromMs: Date.parse(step.from), toMs: Date.parse(step.to) },
        uac,
        samples,
        udp,
        uutProcesses,
        uacProcesses: uacProcessNames(benchmark.load.instances),
        unit
      })
    );
    const rulesOf = (step: MeasuredStep): CapacityRule[] => [
      {
        id: "p99LatencyMs",
        limit: p99LatencyMs,
        measured: step.step.p99Ms,
        passed: step.step.p99Ms < p99LatencyMs
      },
      {
        id: "failedCallsPct",
        limit: failedCallsPct,
        measured: step.failedPct,
        passed: step.failedPct < failedCallsPct
      }
    ];

    const base = {
      id: benchmark.id,
      kind: "capacity" as const,
      title: benchmark.title,
      narrative: benchmark.narrative,
      unit,
      durationS: meta.durationS,
      tool: meta.tool
    };
    const series = { steps: measured.map(({ step }) => step) };
    const resources = toResources(samples, uutProcesses);

    // The ramp ends at the first step that is invalid or breaks a rule.
    const endIndex = measured.findIndex(
      (step) =>
        step.invalidReason !== null ||
        rulesOf(step).some((rule) => !rule.passed)
    );
    const end = endIndex === -1 ? undefined : measured[endIndex];
    if (end?.invalidReason) {
      return {
        ...base,
        verdict: "inconclusive",
        reason: end.invalidReason,
        series,
        resources
      };
    }

    const limitIndex = endIndex === -1 ? measured.length - 1 : endIndex - 1;
    const limit = limitIndex >= 0 ? measured[limitIndex] : undefined;
    const rules = rulesOf((limit ?? end) as MeasuredStep);
    const broken = end ? rulesOf(end).find((rule) => !rule.passed) : undefined;
    const stoppedBy: StoppedBy | null =
      end && broken
        ? {
            offeredCps: end.step.offeredCps,
            rule: broken.id,
            measured: broken.measured,
            limit: broken.limit
          }
        : null;
    const hops = benchmark.telemetry.otlp
      ? computeHops(
          await parseOtlpSpanLines(
            await readRawLines(deps, rawDir, names, "spans.jsonl"),
            "spans.jsonl"
          ),
          benchmark.telemetry.sampleRatio,
          Date.parse(meta.startedAt)
        )
      : undefined;

    return {
      ...base,
      verdict: rules.every((rule) => rule.passed) ? "passed" : "failed",
      reason: null,
      rules,
      headline: limit
        ? {
            limitCps: limit.step.offeredCps,
            limitIsLowerBound: end === undefined,
            p99AtLimitMs: limit.step.p99Ms,
            p50AtLimitMs: limit.step.p50Ms,
            failedAtLimitPct: limit.failedPct,
            retransmissionsAtLimitPct: roundTo(
              limit.step.calls > 0
                ? (limit.step.retransmissions / limit.step.calls) * 100
                : 0
            )
          }
        : {
            limitCps: null,
            limitIsLowerBound: false,
            p99AtLimitMs: null,
            p50AtLimitMs: null,
            failedAtLimitPct: null,
            retransmissionsAtLimitPct: null
          },
      stoppedBy,
      series,
      resources,
      ...(hops ? { hops } : {})
    };
  };

  return withErrorHandlingAndValidation(fn, analyzeCapacityInputSchema);
}
