/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { nameOf, RUN_LABEL } from "../orchestrate/constants.js";
import type { PerfkitConfig } from "../schemas/index.js";
import type { InfraCliDeps } from "./types.js";

/**
 * Removes every container of a --local run: those labeled with its run id
 * (agent, SIPp, samplers, collector) and the UUT compose projects.
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
  return out.code === 0
    ? { summary: `removed the run's containers`, failures: [] }
    : {
        summary: "",
        failures: [
          `could not remove the run's containers: ${out.stderr.trim() || `exit ${out.code}`}`
        ]
      };
}
