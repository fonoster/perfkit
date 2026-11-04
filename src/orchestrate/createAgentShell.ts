/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { SshResult } from "../infra/index.js";
import { DOCKER_CLI_IMAGE } from "../tools.js";
import { nameOf, RUN_LABEL } from "./constants.js";
import { demuxLogs, type EngineRequest } from "./createDockerEngine.js";
import type { RunState } from "./runState.schema.js";
import { shellQuote } from "./shellQuote.js";
import type { HostShell } from "./types.js";

const DOCKER_SOCKET = "/var/run/docker.sock";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** The OpenSSH options the agent logs in to the UUT with. */
export const AGENT_SSH_OPTIONS =
  "-o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=10";

/** Where the CLI puts the run-only private key on the load generator. */
export function agentKeyPath(root: string): string {
  return `${root}/keys/agent`;
}

/**
 * The agent's way to run host commands. Each command runs in a short-lived
 * DOCKER_CLI_IMAGE container on the load generator (host network, the
 * Docker socket and the run's root mounted at the same path). A UUT command
 * goes over SSH to the UUT's private IP with the run-only key; with --local
 * the UUT is this machine, so it runs the same way as a load-generator one.
 */
export function createAgentShell(deps: {
  engine: EngineRequest;
  state: RunState;
}): HostShell {
  const { state, engine } = deps;
  let counter = 0;

  const runHelper = async (
    command: string,
    timeoutMs: number
  ): Promise<SshResult> => {
    counter += 1;
    const name = nameOf(
      state.namePrefix,
      state.runId,
      `sh-${process.pid}-${counter}`
    );
    const created = await engine(
      "POST",
      `/containers/create?name=${encodeURIComponent(name)}`,
      {
        Image: DOCKER_CLI_IMAGE,
        Cmd: ["sh", "-c", command],
        WorkingDir: state.root,
        Labels: { [RUN_LABEL]: state.runId },
        HostConfig: {
          NetworkMode: "host",
          Binds: [
            `${DOCKER_SOCKET}:${DOCKER_SOCKET}`,
            `${state.root}:${state.root}`
          ]
        }
      }
    );
    if (created.status !== 201) {
      return { code: 255, stdout: "", stderr: created.body.toString("utf8") };
    }
    const { Id: id } = JSON.parse(created.body.toString("utf8")) as {
      Id: string;
    };
    try {
      await engine("POST", `/containers/${id}/start`);
      const waited = engine("POST", `/containers/${id}/wait`).then(
        (res) =>
          (JSON.parse(res.body.toString("utf8")) as { StatusCode: number })
            .StatusCode
      );
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      const code = await Promise.race([waited, timedOut]);
      clearTimeout(timer);
      if (code === null) {
        await engine("POST", `/containers/${id}/kill`);
      }
      const logs = await engine(
        "GET",
        `/containers/${id}/logs?stdout=true&stderr=true`
      );
      const { stdout, stderr } = demuxLogs(logs.body);
      return { code: code ?? 255, stdout, stderr };
    } finally {
      await engine("DELETE", `/containers/${id}?force=true`).catch(() => {});
    }
  };

  return (host, command, options = {}) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (host === "uut" && state.mode === "digitalocean") {
      return runHelper(
        `ssh ${AGENT_SSH_OPTIONS} -i ${shellQuote(agentKeyPath(state.root))} root@${state.hosts.uutIp} ${shellQuote(command)}`,
        timeoutMs
      );
    }
    return runHelper(command, timeoutMs);
  };
}
