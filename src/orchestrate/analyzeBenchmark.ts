/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";
import {
  type AnalyzeDeps,
  createAnalyzeCapacity,
  createAnalyzeSoak
} from "../analyze/index.js";
import type { BenchmarkConfig, BenchmarkResult } from "../schemas/index.js";

/** What collect knows about a benchmark that has no full results. */
export type Unfinished = { reason: string };

/**
 * One benchmark's report.json entry. With raw results, #2's analyzer
 * decides; when the agent left an `aborted` reason (the UUT stopped
 * responding) the entry is `aborted` with that reason and whatever series
 * the analyzer could still read. Without raw results it is `aborted` with
 * the given reason.
 */
export async function analyzeBenchmark(
  deps: AnalyzeDeps,
  benchmark: BenchmarkConfig,
  rawDir: string,
  unfinished: Unfinished | null,
  /** The tool line when there are no results, like `SIPp 3.7.3, UDP`. */
  tool: string
): Promise<BenchmarkResult> {
  const base = {
    id: benchmark.id,
    title: benchmark.title,
    narrative: benchmark.narrative,
    unit: benchmark.load.unit
  };
  if (unfinished) {
    return {
      ...base,
      kind: benchmark.kind,
      verdict: "aborted",
      reason: unfinished.reason,
      durationS: 0,
      tool
    } as BenchmarkResult;
  }
  const names = await deps.readdir(rawDir).catch(() => [] as string[]);
  const abortedReason = names.includes("aborted")
    ? (await deps.readFile(join(rawDir, "aborted"))).trim()
    : null;
  const analyzed = await analyze(deps, benchmark, rawDir).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error })
  );
  if (analyzed.result && abortedReason === null) return analyzed.result;
  const reason =
    abortedReason ??
    `the results could not be analyzed: ${clause(analyzed.error)}`;
  const result =
    analyzed.result && "durationS" in analyzed.result ? analyzed.result : null;
  const partial = {
    ...base,
    kind: benchmark.kind,
    verdict: "aborted" as const,
    reason,
    durationS: result?.durationS ?? 0,
    tool: result?.tool ?? tool
  };
  if (result === null) return partial as BenchmarkResult;
  return {
    ...partial,
    ...("series" in result && result.series ? { series: result.series } : {}),
    ...("resources" in result && result.resources
      ? { resources: result.resources }
      : {})
  } as BenchmarkResult;
}

function analyze(
  deps: AnalyzeDeps,
  benchmark: BenchmarkConfig,
  rawDir: string
): Promise<BenchmarkResult> {
  return benchmark.kind === "capacity"
    ? createAnalyzeCapacity(deps)({ rawDir, benchmark })
    : createAnalyzeSoak(deps)({ rawDir, benchmark });
}

function clause(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim().replace(/\.+$/, "") || "unknown error";
}
