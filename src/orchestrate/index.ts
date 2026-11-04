/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Runs the benchmarks on a run's hosts: the CLI starts the agent on the load
 * generator (startRun), the agent drives each benchmark (createAgent), and
 * collect follows it, downloads the raw results and writes report.json.
 */
export { analyzeBenchmark } from "./analyzeBenchmark.js";
export { buildComposeEnv } from "./buildComposeEnv.js";
export { buildReport } from "./buildReport.js";
export { buildSippRoles, countUserRows } from "./buildSippRoles.js";
export * from "./constants.js";
export { createAgent, type AgentOutcome } from "./createAgent.js";
export { createAgentShell } from "./createAgentShell.js";
export { createCollect, type CollectDeps } from "./createCollect.js";
export { createDockerEngine } from "./createDockerEngine.js";
export { createLocalRemote } from "./createLocalRemote.js";
export { createNodeAgentFs } from "./createNodeAgentFs.js";
export { createSshRemote } from "./createSshRemote.js";
export { createStartRun } from "./createStartRun.js";
export { AgentFailure } from "./errors.js";
export { findServicesWithoutHostNetwork } from "./findServicesWithoutHostNetwork.js";
export * from "./runState.schema.js";
export type * from "./types.js";
