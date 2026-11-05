/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  DOCKER_CLI_IMAGE,
  NODE_IMAGE,
  OTELCOL_IMAGE,
  SAMPLER_IMAGE,
  SIPP_BINARY,
  SIPP_IMAGE
} from "../tools.js";
import { ngrokBindingCommand } from "../live/ngrokBindingCommand.js";
import { ngrokVersion } from "../live/ngrokVersion.js";
import { nameOf, RUN_LABEL } from "./constants.js";
import { agentKeyPath } from "./createAgentShell.js";
import { lastLine } from "./errors.js";
import { runPaths } from "./paths.js";
import type { MachineInfo, RunState } from "./runState.schema.js";
import { SAMPLER_SCRIPT } from "./sampler.js";
import { shellJoin, writeFileCommand } from "./shellQuote.js";
import { stageAgentPackage } from "./stageAgentPackage.js";
import { stageProject } from "./stageProject.js";
import { type StartRunInput, startRunInputSchema } from "./startRun.schema.js";
import type { Host, Remote } from "./types.js";

export interface StartRunDeps {
  remote: Remote;
  /** The directory of the running perfkit's package.json. */
  packageRoot: string;
}

/**
 * Creates `startRun`: what the CLI does once the hosts exist. It pulls the
 * pinned images, records each host's vCPUs, memory, OS and Docker version
 * and the SIPp (and collector) version, copies the project to both hosts
 * and the CLI's own package to the load generator, writes run.json and
 * starts the agent as a detached node container with the Docker socket
 * mounted. The agent's run-only key goes to the load generator only.
 *
 * @param deps - The remote hosts and the package to upload (injected)
 * @returns The run state the agent reads
 */
export function createStartRun(deps: StartRunDeps) {
  const { remote } = deps;
  const exec = async (host: Host, command: string, what: string) => {
    const out = await remote.exec(host, command, { timeoutMs: 20 * 60 * 1000 });
    if (out.code !== 0) {
      throw new Error(
        `${what}: ${lastLine(out.stderr || out.stdout, `exit ${out.code}`)}`
      );
    }
    return out.stdout;
  };

  const fn = async (input: StartRunInput): Promise<RunState> => {
    const paths = runPaths(input.root);
    const hosts: Host[] =
      input.mode === "local" ? ["loadgen"] : ["uut", "loadgen"];
    const telemetry = input.plan.benchmarks.some((b) => b.telemetry.otlp);
    const staging = await mkdtemp(join(tmpdir(), "perfkit-stage-"));
    try {
      await Promise.all(
        hosts.map((host) =>
          exec(
            host,
            `mkdir -p ${paths.raw} ${paths.root}/keys && rm -rf ${paths.project} ${paths.agent}`,
            `could not prepare the ${host}`
          )
        )
      );
      const loadgenImages = [
        NODE_IMAGE,
        DOCKER_CLI_IMAGE,
        SAMPLER_IMAGE,
        ...(telemetry ? [OTELCOL_IMAGE] : [])
      ];
      await exec(
        "loadgen",
        [
          ...loadgenImages.map((image) =>
            shellJoin(["docker", "pull", "-q", image])
          ),
          shellJoin([
            "docker",
            "pull",
            "-q",
            "--platform",
            "linux/amd64",
            SIPP_IMAGE
          ])
        ].join(" && "),
        "could not pull the load generator's images"
      );
      if (input.mode !== "local") {
        await exec(
          "uut",
          shellJoin(["docker", "pull", "-q", SAMPLER_IMAGE]),
          "could not pull the sampler image on the server under test"
        );
      }

      const info = async (host: Host): Promise<MachineInfo> =>
        parseDockerInfo(
          await exec(
            host,
            "docker info --format '{{.NCPU}};{{.MemTotal}};{{.OperatingSystem}};{{.ServerVersion}}'",
            `could not read docker info on the ${host}`
          )
        );
      const loadgen = await info("loadgen");
      const uut = input.mode === "local" ? loadgen : await info("uut");
      const sippOut = await exec(
        "loadgen",
        `${shellJoin(["docker", "run", "--rm", "--platform", "linux/amd64", SIPP_IMAGE, SIPP_BINARY, "-v"])} 2>&1; true`,
        "could not run SIPp"
      );
      const sipp =
        /SIPp v(\d+\.\d+\.\d+[\w.-]*?)(?:-TLS|-SCTP|-PCAP|\s|$)/.exec(
          sippOut
        )?.[1];
      if (!sipp)
        throw new Error(
          `could not read the SIPp version from: ${lastLine(sippOut, "no output")}`
        );
      const otelcol = telemetry
        ? /version\s+v?(\d+\.\d+\.\d+)/.exec(
            await exec(
              "loadgen",
              `${shellJoin(["docker", "run", "--rm", OTELCOL_IMAGE, "--version"])} 2>&1`,
              "could not run the OpenTelemetry Collector"
            )
          )?.[1]
        : undefined;

      const state: RunState = {
        runId: input.runId,
        mode: input.mode,
        root: input.root,
        namePrefix: input.namePrefix,
        perfkitVersion: input.perfkitVersion,
        command: input.command,
        plan: input.plan,
        config: input.config,
        ...(input.logoSvg ? { logoSvg: input.logoSvg } : {}),
        hosts: input.hosts,
        ...(input.live ? { live: input.live } : {}),
        machines: { uut, loadgen },
        tools: { sipp, ...(otelcol ? { otelcol } : {}) }
      };

      const project = join(staging, "project");
      await stageProject(input.projectDir, project, input.out);
      const agent = join(staging, "agent");
      await stageAgentPackage(deps.packageRoot, agent);
      const runJson = join(staging, "run.json");
      await writeFile(runJson, `${JSON.stringify(state, null, 2)}\n`);

      await Promise.all(
        hosts.map(async (host) => {
          await remote.upload(host, project, paths.project);
          await exec(
            host,
            writeFileCommand(paths.sampler, SAMPLER_SCRIPT),
            `could not write the sampler on the ${host}`
          );
        })
      );
      await remote.upload("loadgen", agent, paths.agent);
      await remote.upload("loadgen", runJson, paths.runJson);
      if (input.agentKey) {
        const keyFile = join(staging, "agent-key");
        await writeFile(
          keyFile,
          input.agentKey.endsWith("\n")
            ? input.agentKey
            : `${input.agentKey}\n`,
          { mode: 0o600 }
        );
        await remote.upload("loadgen", keyFile, agentKeyPath(input.root));
        await exec(
          "loadgen",
          `chmod 600 ${agentKeyPath(input.root)}`,
          "could not protect the agent's key"
        );
      }

      const tunnel = input.mode === "digitalocean" && input.ngrokToken;
      if (tunnel) {
        // The tunnel's native binding for the agent's Linux; a failure only
        // means no tunnel, so it never stops the run.
        await remote.exec(
          "loadgen",
          ngrokBindingCommand({
            agentDir: paths.agent,
            version: await ngrokVersion(deps.packageRoot)
          }),
          { timeoutMs: 5 * 60 * 1000 }
        );
      }
      const agentName = nameOf(input.namePrefix, input.runId, "agent");
      await exec(
        "loadgen",
        `docker rm -f ${agentName} >/dev/null 2>&1; ${shellJoin([
          "docker",
          "run",
          "-d",
          "--name",
          agentName,
          "--label",
          `${RUN_LABEL}=${input.runId}`,
          "--network",
          "host",
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock",
          "-v",
          `${input.root}:${input.root}`,
          "-w",
          input.root,
          ...(tunnel ? ["-e", `NGROK_AUTHTOKEN=${input.ngrokToken}`] : []),
          NODE_IMAGE,
          "node",
          `${paths.agent}/dist/cli.js`,
          "agent",
          "--run",
          input.runId,
          "--root",
          input.root
        ])}`,
        "could not start the agent"
      );
      return state;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  };

  return withErrorHandlingAndValidation(fn, startRunInputSchema);
}

/** `NCPU;MemTotal;OperatingSystem;ServerVersion` from `docker info`. */
export function parseDockerInfo(text: string): MachineInfo {
  const [ncpu = "", mem = "", os = "", docker = ""] = text.trim().split(";");
  const vcpus = Number(ncpu);
  const memoryMB = Math.floor(Number(mem) / (1024 * 1024));
  if (!(vcpus > 0) || !(memoryMB > 0) || os === "" || docker === "") {
    throw new Error(
      `could not read docker info: ${text.trim() || "no output"}`
    );
  }
  return { vcpus, memoryMB, os, docker };
}
