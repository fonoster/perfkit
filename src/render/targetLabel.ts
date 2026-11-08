/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { BenchmarkResult, Report } from "../schemas/index.js";

/**
 * Where a benchmark ran, for its section head: `Single server`, or
 * `Kubernetes, 3 × c-8` (`Kubernetes (kind), 1 node` with --local). Null
 * for a report written before benchmarks named their target.
 */
export function targetLabel(
  benchmark: BenchmarkResult,
  infra: Report["run"]["infra"]
): string | null {
  if (benchmark.target === undefined) return null;
  if (benchmark.target === "server") return "Single server";
  const cluster = infra.cluster;
  if (!cluster) return "Kubernetes";
  if (cluster.provider === "kind") {
    return `Kubernetes (kind), ${cluster.nodes} node${cluster.nodes === 1 ? "" : "s"}`;
  }
  return `Kubernetes, ${cluster.nodes} × ${cluster.size}`;
}
