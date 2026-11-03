/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import {
  type BenchmarkResult,
  type Report,
  reportSchema,
  SCHEMA_IDS
} from "../schemas/index.js";
import { NOT_SELECTED } from "./constants.js";
import type { RunState } from "./runState.schema.js";

/**
 * The run's report.json v1 from its state and the results of the selected
 * benchmarks. Every benchmark of perfkit.yaml is listed, in its order; one
 * not selected with --benchmarks is `not-run`. With --local the provider,
 * region and sizes are `local`.
 *
 * @throws when the result is not a valid report (a bug, not bad input)
 */
export function buildReport(
  state: RunState,
  results: ReadonlyMap<string, BenchmarkResult>,
  endedAt: string
): Report {
  const { plan, config } = state;
  const local = state.mode === "local";
  const benchmarks = config.benchmarks.map<BenchmarkResult>(
    (benchmark) =>
      results.get(benchmark.id) ??
      ({
        id: benchmark.id,
        kind: benchmark.kind,
        title: benchmark.title,
        narrative: benchmark.narrative,
        unit: benchmark.load.unit,
        verdict: "not-run",
        reason: NOT_SELECTED
      } as BenchmarkResult)
  );
  const count = (verdict: BenchmarkResult["verdict"]) =>
    benchmarks.filter((benchmark) => benchmark.verdict === verdict).length;
  const report = {
    schema: SCHEMA_IDS.report,
    project: {
      name: config.project.name,
      repo: config.project.repo,
      siteUrl: config.project.siteUrl,
      accent: config.project.accent,
      ...(state.logoSvg ? { logoSvg: state.logoSvg } : {}),
      title: config.project.title,
      lead: config.project.lead
    },
    run: {
      id: plan.runId,
      version: plan.targetVersion,
      commit: plan.commit,
      startedAt: plan.startedAt,
      endedAt,
      infra: {
        provider: state.mode,
        region: local ? "local" : plan.region,
        uut: {
          size: local ? "local" : plan.uut.size,
          vcpus: state.machines.uut.vcpus,
          memoryMB: state.machines.uut.memoryMB
        },
        loadgen: {
          size: local ? "local" : plan.loadgen.size,
          vcpus: state.machines.loadgen.vcpus,
          memoryMB: state.machines.loadgen.memoryMB
        },
        os: state.machines.uut.os,
        docker: state.machines.uut.docker
      },
      images: Object.fromEntries(
        plan.images.map((image) => [image.key, image.ref])
      ),
      tools: {
        perfkit: state.perfkitVersion,
        sipp: state.tools.sipp,
        ...(state.tools.otelcol ? { otelcol: state.tools.otelcol } : {})
      },
      command: state.command
    },
    verdict: {
      total: benchmarks.length,
      passed: count("passed"),
      failed: count("failed"),
      inconclusive: count("inconclusive"),
      aborted: count("aborted"),
      notRun: count("not-run")
    },
    benchmarks
  };
  return reportSchema.parse(report);
}
