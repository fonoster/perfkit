/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * An in-memory DigitalOcean account and the other fakes `run` and `sweep`
 * need. Nothing here reaches the network or spawns a program.
 */
import { mkdtempSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/runCli.js";
import type { CliDeps, InfraCliDeps } from "../../src/cli/types.js";
import { DigitalOceanError } from "../../src/infra/errors.js";
import type {
  DoClient,
  DoDroplet,
  DoFirewall,
  DoFirewallInput,
  DoSshKey,
  DoVpc,
  Plan,
  RegistryClient,
  SshResult,
  SshTools
} from "../../src/infra/index.js";

export const START = Date.parse("2026-11-03T14:12:10Z");
export const COMMIT = "bd3254a4f3e1c0ffee00000000000000000000aa";
export const RUN_ID = "20261103T141210Z-bd3254a";
export const DIGEST = {
  edgeport: `sha256:4f1c${"0".repeat(56)}e2a0`,
  echo: `sha256:41ab${"1".repeat(56)}77d0`,
  one: `sha256:9b07${"2".repeat(56)}1d3c`
};
export const PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBcWJ2eYt8Wlm0GzZjM5hzQ8wq3WJm8g5pX2KQ9bYk0K perfkit";
export const PRIVATE_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n";

type Method = keyof DoClient;

/**
 * A fake DigitalOcean account. `failures[method]` returns an error message
 * for the nth call (1-based) to fail it. `lingerPolls` is how many member
 * polls still list a deleted droplet in its VPC, as the real API does while
 * a delete finishes.
 */
export class FakeDigitalOcean implements DoClient {
  keys: DoSshKey[] = [];
  vpcs: DoVpc[] = [];
  droplets: DoDroplet[] = [];
  firewalls: DoFirewall[] = [];
  tags = new Set<string>();
  calls: Array<{ method: Method; args: unknown[] }> = [];
  failures: Partial<Record<Method, (n: number) => string | undefined>> = {};
  lingerPolls = 0;
  /** getDroplet polls before a new droplet is active. */
  pollsUntilActive = 1;
  private lingering = new Map<string, number>();
  private nextId = 512034567;
  private polls = new Map<number, number>();

  constructor(private readonly now: () => number = () => START) {}

  private record(method: Method, args: unknown[]): void {
    this.calls.push({ method, args });
    const n = this.calls.filter((call) => call.method === method).length;
    const message = this.failures[method]?.(n);
    if (message) throw new DigitalOceanError(message, 422, "X", method);
  }

  callsTo(method: Method): unknown[][] {
    return this.calls
      .filter((call) => call.method === method)
      .map(({ args }) => args);
  }

  private stamp(): string {
    return new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  async listSshKeys() {
    this.record("listSshKeys", []);
    return structuredClone(this.keys);
  }
  async getSshKey(fingerprint: string) {
    this.record("getSshKey", [fingerprint]);
    return this.keys.find((key) => key.fingerprint === fingerprint) ?? null;
  }
  async createSshKey(input: { name: string; public_key: string }) {
    this.record("createSshKey", [input]);
    const key = {
      id: this.nextId++,
      name: input.name,
      fingerprint: `fp:${this.nextId}`,
      public_key: input.public_key
    };
    this.keys.push(key);
    return structuredClone(key);
  }
  async deleteSshKey(id: number) {
    this.record("deleteSshKey", [id]);
    this.keys = this.keys.filter((key) => key.id !== id);
  }

  async listVpcs() {
    this.record("listVpcs", []);
    return structuredClone(this.vpcs);
  }
  async createVpc(input: {
    name: string;
    region: string;
    description: string;
  }) {
    this.record("createVpc", [input]);
    const vpc = {
      id: `vpc-${this.nextId++}`,
      name: input.name,
      region: input.region,
      ip_range: "10.116.0.0/20",
      created_at: this.stamp()
    };
    this.vpcs.push(vpc);
    return structuredClone(vpc);
  }
  async listVpcMembers(id: string) {
    this.record("listVpcMembers", [id]);
    const left = this.lingering.get(id) ?? 0;
    if (left > 0) this.lingering.set(id, left - 1);
    const live = this.droplets
      .filter((droplet) => this.vpcOf.get(droplet.id) === id)
      .map((droplet) => ({
        urn: `do:droplet:${droplet.id}`,
        name: droplet.name
      }));
    return left > 0 && live.length === 0
      ? [{ urn: "do:droplet:gone", name: "deleting" }]
      : live;
  }
  async deleteVpc(id: string) {
    this.record("deleteVpc", [id]);
    if (this.droplets.some((droplet) => this.vpcOf.get(droplet.id) === id)) {
      throw new DigitalOceanError("VPC has members", 403, "DELETE", id);
    }
    this.vpcs = this.vpcs.filter((vpc) => vpc.id !== id);
  }

  private vpcOf = new Map<number, string>();

  async listDroplets(input: { tag: string }) {
    this.record("listDroplets", [input]);
    return structuredClone(
      this.droplets.filter((droplet) => droplet.tags.includes(input.tag))
    );
  }
  async getDroplet(id: number) {
    this.record("getDroplet", [id]);
    const droplet = this.droplets.find((candidate) => candidate.id === id);
    if (!droplet) throw new DigitalOceanError("not found", 404, "GET", "x");
    const polls = (this.polls.get(id) ?? 0) + 1;
    this.polls.set(id, polls);
    if (polls >= this.pollsUntilActive && droplet.status === "new") {
      droplet.status = "active";
      droplet.networks.v4 = [
        { type: "public", ip_address: `203.0.113.${(id % 200) + 1}` },
        { type: "private", ip_address: `10.116.0.${(id % 200) + 1}` }
      ];
    }
    return structuredClone(droplet);
  }
  async createDroplet(input: Parameters<DoClient["createDroplet"]>[0]) {
    this.record("createDroplet", [input]);
    const droplet: DoDroplet = {
      id: this.nextId++,
      name: input.name,
      status: "new",
      created_at: this.stamp(),
      tags: [...input.tags],
      networks: { v4: [] }
    };
    input.tags.forEach((tag) => this.tags.add(tag));
    this.vpcOf.set(droplet.id, input.vpc_uuid);
    this.droplets.push(droplet);
    return structuredClone(droplet);
  }
  async deleteDroplet(id: number) {
    this.record("deleteDroplet", [id]);
    const vpc = this.vpcOf.get(id);
    if (vpc && this.droplets.some((droplet) => droplet.id === id)) {
      this.lingering.set(vpc, this.lingerPolls);
    }
    this.droplets = this.droplets.filter((droplet) => droplet.id !== id);
  }

  async listFirewalls() {
    this.record("listFirewalls", []);
    return structuredClone(this.firewalls);
  }
  async createFirewall(input: DoFirewallInput) {
    this.record("createFirewall", [input]);
    const firewall = {
      ...structuredClone(input),
      id: `fw-${this.nextId++}`,
      status: "succeeded",
      created_at: this.stamp()
    };
    this.firewalls.push(firewall);
    return structuredClone(firewall);
  }
  async updateFirewall(id: string, input: DoFirewallInput) {
    this.record("updateFirewall", [id, input]);
    const index = this.firewalls.findIndex((firewall) => firewall.id === id);
    const current = this.firewalls[index]!;
    this.firewalls[index] = { ...current, ...structuredClone(input) };
    return structuredClone(this.firewalls[index]!);
  }
  async deleteFirewall(id: string) {
    this.record("deleteFirewall", [id]);
    this.firewalls = this.firewalls.filter((firewall) => firewall.id !== id);
  }

  async deleteTag(name: string) {
    this.record("deleteTag", [name]);
    this.tags.delete(name);
  }

  /** Adds a droplet as if an earlier run had created it. */
  seedDroplet(input: {
    name: string;
    tags: string[];
    createdAt: number;
    vpcId?: string;
  }): DoDroplet {
    const droplet: DoDroplet = {
      id: this.nextId++,
      name: input.name,
      status: "active",
      created_at: new Date(input.createdAt).toISOString(),
      tags: input.tags,
      networks: { v4: [] }
    };
    input.tags.forEach((tag) => this.tags.add(tag));
    if (input.vpcId) this.vpcOf.set(droplet.id, input.vpcId);
    this.droplets.push(droplet);
    return droplet;
  }

  /** Everything still billing or left over: droplets, VPCs, firewalls, keys. */
  leftovers() {
    return {
      droplets: this.droplets.map(({ name }) => name),
      vpcs: this.vpcs.map(({ name }) => name),
      firewalls: this.firewalls.map(({ name }) => name),
      keys: this.keys.map(({ name }) => name)
    };
  }
}

export function fakeRegistry(
  digests: Record<string, string> = {
    "fonoster/routr-edgeport:2.31.5": DIGEST.edgeport,
    "fonoster/routr-echo:2.31.5": DIGEST.echo,
    "fonoster/routr-one:2.31.5": DIGEST.one
  }
): RegistryClient & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    getDigest: async (name, tag) => {
      asked.push(`${name}:${tag}`);
      return digests[`${name}:${tag}`] ?? null;
    }
  };
}

export function fakeSsh(
  results: SshResult[] = []
): SshTools & { commands: string[] } {
  const commands: string[] = [];
  const queue = [...results];
  return {
    commands,
    generateKeyPair: async () => ({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY
    }),
    publicKeyOf: async (privateKey) => {
      if (!privateKey.includes("OPENSSH PRIVATE KEY")) throw new Error("bad");
      return PUBLIC_KEY;
    },
    exec: async ({ command }) => {
      commands.push(command);
      return queue.shift() ?? { code: 0, stdout: "status: done\n", stderr: "" };
    },
    upload: async () => ({ code: 0, stdout: "", stderr: "" }),
    download: async () => ({ code: 0, stdout: "", stderr: "" })
  };
}

/** A clock that only moves when the code under test sleeps. */
export function fakeClock(start = START) {
  const clock = { now: start, slept: [] as number[] };
  return {
    clock,
    now: () => clock.now,
    sleep: async (ms: number) => {
      clock.slept.push(ms);
      clock.now += ms;
    }
  };
}

export function infraDeps(
  overrides: Partial<InfraCliDeps> & { account?: FakeDigitalOcean } = {}
): InfraCliDeps & {
  account: FakeDigitalOcean;
  clients: string[];
  clock: ReturnType<typeof fakeClock>["clock"];
} {
  const { clock, now, sleep } = fakeClock();
  const account = overrides.account ?? new FakeDigitalOcean(now);
  const clients: string[] = [];
  return {
    env: {},
    now,
    sleep,
    gitHead: async () => COMMIT,
    registry: fakeRegistry(),
    getPublicIp: async () => "203.0.113.7",
    createDoClient: (token) => {
      clients.push(token);
      return account;
    },
    ssh: fakeSsh(),
    runProgram: async () => ({ code: 0, stdout: "", stderr: "" }),
    home: mkdtempSync(join(tmpdir(), "perfkit-home-")),
    packageRoot: "/nonexistent/perfkit",
    namePrefix: "pk",
    runAgent: async () => ({ status: "done" }),
    executeBenchmarks: async () => ({ passed: true }),
    ...overrides,
    account,
    clients,
    clock
  };
}

/** Runs the CLI in process with the given infra fakes. */
export async function perfkit(
  args: string[],
  infra: InfraCliDeps = infraDeps(),
  files: Record<string, string> = {}
) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    version: "9.8.7",
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readFile: async (path) =>
      path in files ? files[path]! : readFile(path, "utf8"),
    isFile: async (path) =>
      stat(path).then(
        (s) => s.isFile(),
        () => false
      ),
    writeFile: async () => {
      throw new Error("run and sweep never write the site");
    },
    fetchText: async () => {
      throw new Error("run and sweep never fetch");
    },
    infra
  };
  const code = await runCli(["node", "perfkit", ...args], deps);
  return { code, out: out.join(""), err: err.join("") };
}

/** The plan of the Routr example at 2.31.5, built by the real planRun. */
export async function makePlan(): Promise<Plan> {
  const { parse } = await import("yaml");
  const { readFileSync } = await import("node:fs");
  const { ROUTR_CONFIG } = await import("../fixtures.js");
  const { perfkitConfigSchema } = await import("../../src/schemas/index.js");
  const { createPlanRun, createResolveImageDigests } =
    await import("../../src/infra/index.js");
  const planRun = createPlanRun({
    resolveImageDigests: createResolveImageDigests({
      registry: fakeRegistry()
    }),
    getPublicIp: async () => "203.0.113.7"
  });
  return planRun({
    config: perfkitConfigSchema.parse(
      parse(readFileSync(ROUTR_CONFIG, "utf8"))
    ),
    targetVersion: "2.31.5",
    commit: COMMIT,
    startedAt: "2026-11-03T14:12:10Z"
  });
}
