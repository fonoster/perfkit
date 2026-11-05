/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * A whole run against fake droplets: the CLI with the fake DigitalOcean
 * account, SSH to FakeHosts, and the real agent run in-process when the CLI
 * starts its container, against the same fake hosts.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent } from "../../src/orchestrate/createAgent.js";
import type { AgentOutcome } from "../../src/orchestrate/createAgent.js";
import { REMOTE_ROOT } from "../../src/orchestrate/constants.js";
import type { Host } from "../../src/orchestrate/types.js";
import type { SshTools } from "../../src/infra/index.js";
import { capacityRaw, START_MS } from "../analyze/builders.js";
import { EXAMPLES } from "../fixtures.js";
import {
  DIGEST,
  fakeClock,
  fakeRegistry,
  FakeDigitalOcean,
  infraDeps,
  PRIVATE_KEY,
  PUBLIC_KEY
} from "../infra/fakes.js";
import { fakePackage, FakeHosts, writeRaw } from "./harness.js";

export const MINIMAL_CONFIG = join(EXAMPLES, "minimal", "perfkit.yaml");
export const MINIMAL = [
  "run",
  "--config",
  MINIMAL_CONFIG,
  "--target-version",
  "3.7.3"
];
export const TOKEN =
  "dop_v1_feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfaceabcd";
export const SHARED_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nshared-secret-key\n-----END OPENSSH PRIVATE KEY-----\n";
export const AGENT_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nagent-run-only\n-----END OPENSSH PRIVATE KEY-----\n";
export const SIPP_DIGEST = DIGEST.echo;

/** Four 60 s steps of 50 to 200 requests/s, all well inside the limits. */
export const PASSING_STEPS = [50, 100, 150, 200].map((offeredCps) => ({
  offeredCps
}));

/**
 * SIPp's and the sampler's files, written when the agent starts the uac and,
 * for a soak, already when it starts the register role, whose counts file the
 * agent reads before it starts the uac.
 */
export type RawFiles =
  Record<string, string> | ((benchmarkId: string) => Record<string, string>);

export function sippWriter(hosts: FakeHosts, files: RawFiles) {
  return async (host: Host, command: string) => {
    if (!/--name \S+-sipp-(uac|register) /.test(command)) return undefined;
    const raw = /-v (\S+):\/raw/.exec(command)?.[1] as string;
    const id = raw.slice(raw.lastIndexOf("/") + 1);
    const chosen = typeof files === "function" ? files(id) : files;
    const named = Object.fromEntries(
      Object.entries(chosen).map(([name, text]) => [
        name === "sampler.jsonl"
          ? "sampler-loadgen.jsonl"
          : name === "udp.jsonl"
            ? "udp-loadgen.jsonl"
            : name,
        text
      ])
    );
    delete named["meta.json"];
    await writeRaw(hosts.map(host, raw), named);
    return { code: 0, stdout: "c0ffee\n", stderr: "" };
  };
}

/** SSH tools over FakeHosts: the droplet with that public IP is the host. */
export function hostSsh(
  hosts: FakeHosts,
  account: FakeDigitalOcean,
  order: string[] = []
): SshTools & { keysUsed: string[] } {
  const keysUsed: string[] = [];
  const role = (ip: string): Host => {
    const droplet = account.droplets.find(({ networks }) =>
      networks.v4.some(({ ip_address }) => ip_address === ip)
    );
    return droplet?.name.endsWith("-uut") ? "uut" : "loadgen";
  };
  let generated = 0;
  return {
    keysUsed,
    generateKeyPair: async () => {
      generated += 1;
      return generated === 1
        ? {
            privateKey: AGENT_KEY,
            publicKey: `${PUBLIC_KEY.slice(0, -7)}agent`
          }
        : { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY };
    },
    publicKeyOf: async () => PUBLIC_KEY,
    exec: async ({ host, privateKey, command }) => {
      keysUsed.push(privateKey);
      order.push(`ssh ${role(host)}`);
      if (command.startsWith("cloud-init"))
        return { code: 0, stdout: "", stderr: "" };
      return hosts.exec(role(host), command, "cli");
    },
    upload: async ({ host, localPath, remotePath }) => {
      order.push(`upload ${role(host)}`);
      await hosts.upload(role(host), localPath, remotePath);
      return { code: 0, stdout: "", stderr: "" };
    },
    download: async ({ host, remotePath, localPath }) => {
      try {
        await hosts.download(role(host), remotePath, localPath);
        return { code: 0, stdout: "", stderr: "" };
      } catch (err) {
        return { code: 255, stdout: "", stderr: String(err) };
      }
    }
  };
}

/** Runs the real agent on the fake load generator, to its end. */
export function agentRunner(hosts: FakeHosts, root = REMOTE_ROOT) {
  const clock = fakeClock(START_MS);
  const fs = hosts.agentFs();
  return {
    clock: clock.clock,
    run: (runId: string): Promise<AgentOutcome> =>
      createAgent({
        shell: hosts.agentShell,
        fs,
        now: clock.now,
        sleep: clock.sleep,
        log: (line) => fs.appendFile(`${root}/progress.log`, `${line}\n`)
      })({ root, runId })
  };
}

/** The CLI deps of a DigitalOcean run against FakeHosts. */
export async function doSetup(
  options: {
    files?: RawFiles;
    env?: {
      DIGITALOCEAN_TOKEN?: string;
      PERFKIT_SSH_KEY?: string;
      NGROK_AUTHTOKEN?: string;
      NGROK_DOMAIN?: string;
    };
    agentOnStart?: boolean;
  } = {}
) {
  const hosts = await FakeHosts.create();
  const clock = fakeClock();
  const account = new FakeDigitalOcean(clock.now);
  const order: string[] = [];
  const ssh = hostSsh(hosts, account, order);
  const agent = agentRunner(hosts);
  hosts.onDocker = sippWriter(
    hosts,
    options.files ?? capacityRaw(PASSING_STEPS)
  );
  let runId = "";
  if (options.agentOnStart !== false) {
    hosts.onAgentStart = async () => {
      await agent.run(runId);
    };
  }
  const out = await mkdtemp(join(tmpdir(), "perfkit-out-"));
  const infra = infraDeps({
    env: options.env ?? { DIGITALOCEAN_TOKEN: TOKEN },
    account,
    now: clock.now,
    sleep: clock.sleep,
    ssh,
    registry: fakeRegistry({ "pumpagubben/sipp:3.7.3": SIPP_DIGEST }),
    packageRoot: await fakePackage("9.8.7"),
    executeBenchmarks: undefined
  });
  const originalCreate = account.createDroplet.bind(account);
  account.createDroplet = async (input) => {
    const droplet = await originalCreate(input);
    runId = input.name.replace(/^perfkit-/, "").replace(/-(uut|loadgen)$/, "");
    return droplet;
  };
  const originalUpdate = account.updateFirewall.bind(account);
  account.updateFirewall = async (id, input) => {
    order.push("updateFirewall");
    return originalUpdate(id, input);
  };
  return { hosts, account, infra, ssh, agent, out, order, runId: () => runId };
}
