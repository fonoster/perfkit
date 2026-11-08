/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { clusterNameOf } from "../infra/constants.js";
import { nameOf, RUN_LABEL } from "../orchestrate/constants.js";
import { shellJoin } from "../orchestrate/shellQuote.js";
import { isHelmUut, type PerfkitConfig } from "../schemas/index.js";
import type { InfraCliDeps } from "./types.js";

/**
 * Removes every container of a --local run: those labeled with its run id
 * (agent, SIPp, samplers, collector, Kubernetes tools) and the UUT compose
 * projects, and, when a benchmark has `uut.helm`, deletes its kind cluster.
 */
export async function localTeardown(
  runId: string,
  config: PerfkitConfig,
  infra: Pick<InfraCliDeps, "runProgram" | "namePrefix">
): Promise<{ summary: string; failures: string[] }> {
  const filters = [
    `label=${RUN_LABEL}=${runId}`,
    ...config.benchmarks.map(
      ({ id }) =>
        `label=com.docker.compose.project=${nameOf(infra.namePrefix, runId, id)}`
    )
  ];
  const script = filters
    .map(
      (filter) =>
        `ids=$(docker ps -aq --filter '${filter}'); [ -z "$ids" ] || docker rm -f $ids >/dev/null`
    )
    .join("; ");
  const out = await infra.runProgram("sh", ["-c", script], {
    timeoutMs: 5 * 60 * 1000
  });
  const failures =
    out.code === 0
      ? []
      : [
          `could not remove the run's containers: ${out.stderr.trim() || `exit ${out.code}`}`
        ];
  const kind = config.benchmarks.some(({ uut }) => isHelmUut(uut));
  if (!kind) {
    return failures.length === 0
      ? { summary: `removed the run's containers`, failures }
      : { summary: "", failures };
  }
  const name = clusterNameOf(runId);
  // kind exits 0 when the cluster does not exist.
  const deleted = await infra.runProgram(
    "sh",
    ["-c", shellJoin(["kind", "delete", "cluster", "--name", name])],
    { timeoutMs: 5 * 60 * 1000 }
  );
  const all =
    deleted.code === 0
      ? failures
      : [
          ...failures,
          `could not delete the kind cluster ${name}: ${(deleted.stderr || deleted.stdout).trim().split("\n").pop() || `exit ${deleted.code}`}; delete it with: kind delete cluster --name ${name}`
        ];
  return all.length === 0
    ? {
        summary: `removed the run's containers and the kind cluster ${name}`,
        failures: all
      }
    : { summary: "", failures: all };
}
