/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { BenchmarkResult, Report } from "../schemas/index.js";
import { formatCapacitySummary } from "./formatCapacitySummary.js";
import { formatSoakSummary } from "./formatSoakSummary.js";
import { capitalized, cell, duration, verdictWord } from "./markdown.js";

/**
 * A report.json as GitHub Markdown, for a workflow's run summary: the run
 * (id, target version, commit, machines), the overall verdict, and per
 * benchmark its verdict (with the reason when it has one), then the
 * capacity limit and steps or the soak rules.
 */
export function formatReportSummary(report: Report): string {
  const { run, verdict } = report;
  const others = (
    [
      ["failed", verdict.failed],
      ["inconclusive", verdict.inconclusive],
      ["aborted", verdict.aborted],
      ["not run", verdict.notRun]
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([word, n]) => `${n} ${word}`);
  const header = [
    `## perfkit run ${run.id}`,
    [
      `**${cell(report.project.name)} ${cell(run.version)}**, commit \`${run.commit}\`.`,
      `**${verdict.passed} of ${verdict.total} benchmark${verdict.total === 1 ? "" : "s"} passed**${others.length > 0 ? ` (${others.join(", ")})` : ""}.`
    ].join(" "),
    `Started ${run.startedAt}, ended ${run.endedAt}; ${run.infra.provider} ${run.infra.region}, server under test ${run.infra.uut.size}, load generator ${run.infra.loadgen.size}; perfkit ${run.tools.perfkit}.`
  ];
  return `${[...header, ...report.benchmarks.map(formatBenchmark)].join("\n\n")}\n`;
}

function formatBenchmark(benchmark: BenchmarkResult): string {
  const heading = `### ${cell(benchmark.title)} (\`${benchmark.id}\`): ${verdictWord(benchmark.verdict)}`;
  const about =
    benchmark.verdict === "not-run"
      ? `${benchmark.kind === "capacity" ? "Capacity" : "Soak"} benchmark.`
      : `${benchmark.kind === "capacity" ? "Capacity" : "Soak"} benchmark, ${duration(benchmark.durationS)}, ${cell(benchmark.tool)}.`;
  const reason =
    benchmark.reason === null
      ? []
      : [
          `**${capitalized(verdictWord(benchmark.verdict))}:** ${cell(benchmark.reason)}.`
        ];
  const body =
    benchmark.kind === "capacity"
      ? formatCapacitySummary(benchmark)
      : formatSoakSummary(benchmark);
  return [heading, about, ...reason, ...(body === "" ? [] : [body])].join(
    "\n\n"
  );
}
