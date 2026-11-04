/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFile, rm } from "node:fs/promises";
import { createNodeAnalyzeDeps } from "../analyze/index.js";
import {
  createAllowSsh,
  createSweep,
  createTeardown,
  formatDeleteFailure,
  messageOf
} from "../infra/index.js";
import { REMOTE_ROOT } from "../orchestrate/constants.js";
import { createCollect } from "../orchestrate/createCollect.js";
import { createLocalRemote } from "../orchestrate/createLocalRemote.js";
import { createSshRemote } from "../orchestrate/createSshRemote.js";
import { parseSpan } from "../orchestrate/formatResultLine.js";
import { runPaths } from "../orchestrate/paths.js";
import { runStateSchema } from "../orchestrate/runState.schema.js";
import { runIdSchema } from "../schemas/primitives.schema.js";
import { localTeardown } from "./localTeardown.js";
import { homeRunDir } from "./runState.js";
import { type CliDeps, EXIT_BAD_INPUT, EXIT_INFRA } from "./types.js";

export interface CollectCommandOptions {
  runId: string;
  wait: boolean;
  out: string;
  /** `5h50m`; null waits for ever (run without --detach). */
  timeout: string | null;
}

/**
 * `perfkit collect <run-id>`: find the run (its droplets by the tag
 * `perfkit-run-<id>`, or a --local run in ~/.perfkit/runs), let this
 * machine's IP through the firewall, and follow it with createCollect.
 */
export async function runCollectCommand(
  options: CollectCommandOptions,
  deps: CliDeps
): Promise<number> {
  const { infra } = deps;
  const fail = (code: number, message: string) => {
    deps.stderr(`perfkit: ${message}\n`);
    return code;
  };
  if (!runIdSchema.safeParse(options.runId).success) {
    return fail(
      EXIT_BAD_INPUT,
      `${options.runId}: expected a run id like 20261103T141210Z-bd3254a`
    );
  }
  const timeoutMs =
    options.timeout === null ? null : parseSpan(options.timeout);
  if (options.timeout !== null && timeoutMs === null) {
    return fail(
      EXIT_BAD_INPUT,
      `--timeout: expected a duration like 5h50m, 90m or 30s`
    );
  }
  const dirs = homeRunDir(infra.home, options.runId);
  const common = {
    analyzeDeps: createNodeAnalyzeDeps(),
    now: infra.now,
    sleep: infra.sleep,
    signals: infra.signals ?? process,
    stdout: deps.stdout,
    stderr: deps.stderr
  };
  const input = {
    runId: options.runId,
    wait: options.wait,
    out: options.out,
    timeoutMs
  };

  const localText = await readFile(dirs.local, "utf8").catch(() => null);
  if (localText !== null) {
    const { root } = JSON.parse(localText) as { root: string };
    const config = await readFile(runPaths(root).runJson, "utf8")
      .then((text) => runStateSchema.parse(JSON.parse(text)).config)
      .catch(() => null);
    return createCollect({
      ...common,
      remote: createLocalRemote({ run: infra.runProgram }),
      root,
      teardown: async () => {
        const result = config
          ? await localTeardown(options.runId, config, infra)
          : { summary: "", failures: [] };
        if (result.failures.length === 0) {
          await rm(dirs.dir, { recursive: true, force: true }).catch(() => {});
        }
        return result;
      }
    })(input);
  }

  const token = infra.env.DIGITALOCEAN_TOKEN;
  if (!token) return fail(EXIT_BAD_INPUT, "DIGITALOCEAN_TOKEN is not set");
  const privateKey =
    infra.env.PERFKIT_SSH_KEY ??
    (await readFile(dirs.key, "utf8").catch(() => null));
  if (!privateKey) {
    return fail(
      EXIT_BAD_INPUT,
      `no SSH key for run ${options.runId}; set PERFKIT_SSH_KEY`
    );
  }
  const client = infra.createDoClient(token);
  let publicIps: { uut: string; loadgen: string };
  try {
    const droplets = await client.listDroplets({
      tag: `perfkit-run-${options.runId}`
    });
    const ipOf = (role: string) =>
      droplets
        .find(({ name }) => name === `perfkit-${options.runId}-${role}`)
        ?.networks.v4.find(({ type }) => type === "public")?.ip_address;
    const uut = ipOf("uut");
    const loadgen = ipOf("loadgen");
    if (!uut || !loadgen) {
      return fail(EXIT_INFRA, `no droplets for run ${options.runId}`);
    }
    publicIps = { uut, loadgen };
    await createAllowSsh({ client })(options.runId, await infra.getPublicIp());
  } catch (err) {
    return fail(EXIT_INFRA, `DigitalOcean API error: ${messageOf(err)}`);
  }

  const sweep = createSweep({
    client,
    teardown: createTeardown({ client, sleep: infra.sleep, now: infra.now }),
    now: infra.now
  });
  return createCollect({
    ...common,
    remote: createSshRemote({ ssh: infra.ssh, privateKey, publicIps }),
    root: REMOTE_ROOT,
    teardown: async () => {
      const result = await sweep({ runId: options.runId });
      const swept = result.runs.find(({ runId }) => runId === options.runId);
      const failures = (swept?.failures ?? []).map((failure) =>
        formatDeleteFailure(failure, options.runId)
      );
      if (failures.length === 0) {
        await rm(dirs.dir, { recursive: true, force: true });
      }
      const kinds = [...new Set((swept?.others ?? []).map(({ kind }) => kind))];
      const droplets = swept?.droplets.length ?? 0;
      return {
        summary: `deleted ${[`${droplets} droplet${droplets === 1 ? "" : "s"}`, ...kinds].join(", ")}`,
        failures
      };
    }
  })(input);
}
