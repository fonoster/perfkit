/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Report, RunBenchmark, RunEntry } from "../schemas/index.js";

/**
 * The runs.json entry for a report: the run's identity, its verdict counts
 * and the headline numbers the history table and the deltas read. Its page
 * lives at `runs/<id>/`, relative to runs.json.
 */
export function toRunEntry(report: Report): RunEntry {
  return {
    id: report.run.id,
    startedAt: report.run.startedAt,
    version: report.run.version,
    commit: report.run.commit,
    path: `runs/${report.run.id}/`,
    verdict: { ...report.verdict },
    benchmarks: report.benchmarks.map((benchmark): RunBenchmark => {
      if (benchmark.kind === "capacity") {
        return benchmark.verdict === "passed" || benchmark.verdict === "failed"
          ? {
              id: benchmark.id,
              kind: "capacity",
              verdict: benchmark.verdict,
              headline: {
                limitCps: benchmark.headline.limitCps,
                p99AtLimitMs:
                  benchmark.headline.limitCps === null
                    ? null
                    : benchmark.headline.p99AtLimitMs
              }
            }
          : {
              id: benchmark.id,
              kind: "capacity",
              verdict: benchmark.verdict,
              headline: null
            };
      }
      return benchmark.verdict === "passed" || benchmark.verdict === "failed"
        ? {
            id: benchmark.id,
            kind: "soak",
            verdict: benchmark.verdict,
            headline: {
              memoryGrowthMBPerHour: benchmark.headline.memoryGrowthMBPerHour
            }
          }
        : {
            id: benchmark.id,
            kind: "soak",
            verdict: benchmark.verdict,
            headline: null
          };
    })
  };
}
