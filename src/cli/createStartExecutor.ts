/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { REMOTE_ROOT } from "../orchestrate/constants.js";
import { createSshRemote } from "../orchestrate/createSshRemote.js";
import { createStartRun } from "../orchestrate/createStartRun.js";
import { homeRunDir } from "./runState.js";
import type { BenchmarkExecutor, CliDeps } from "./types.js";

/**
 * The real executor: it keeps the run-only login key in
 * `~/.perfkit/runs/<id>/` (unless PERFKIT_SSH_KEY is the login), copies the
 * project and perfkit to the droplets, starts the agent and hands off.
 */
export function createStartExecutor(deps: CliDeps): BenchmarkExecutor {
  const { infra } = deps;
  return async (ctx, options) => {
    const { run, plan } = ctx;
    if (!run.sshKey.shared) {
      const { key } = homeRunDir(infra.home, plan.runId);
      await mkdir(dirname(key), { recursive: true, mode: 0o700 });
      await writeFile(key, run.identity.privateKey, { mode: 0o600 });
    }
    const config = options.config;
    const logoSvg = config.project.logo
      ? await readFile(
          join(dirname(options.configPath), config.project.logo),
          "utf8"
        )
      : undefined;
    const faviconSvg = config.project.favicon
      ? await readFile(
          join(dirname(options.configPath), config.project.favicon),
          "utf8"
        )
      : undefined;
    await createStartRun({
      remote: createSshRemote({
        ssh: infra.ssh,
        privateKey: run.identity.privateKey,
        publicIps: { uut: run.uut.publicIp, loadgen: run.loadgen.publicIp }
      }),
      packageRoot: infra.packageRoot
    })({
      runId: plan.runId,
      mode: "digitalocean",
      root: REMOTE_ROOT,
      namePrefix: infra.namePrefix,
      perfkitVersion: deps.version,
      command: options.command,
      plan,
      config,
      ...(logoSvg ? { logoSvg: logoSvg.trim() } : {}),
      ...(faviconSvg ? { faviconSvg: faviconSvg.trim() } : {}),
      hosts: {
        uutIp: run.uut.privateIp,
        loadgenIp: run.loadgen.privateIp,
        vpcCidr: run.vpc.ipRange
      },
      projectDir: dirname(options.configPath),
      out: options.out,
      agentKey: options.agentKey,
      ...(options.live ? { live: options.live } : {}),
      ...(infra.env.NGROK_AUTHTOKEN
        ? { ngrokToken: infra.env.NGROK_AUTHTOKEN }
        : {})
    });
    ctx.handOff();
    return { passed: true };
  };
}
