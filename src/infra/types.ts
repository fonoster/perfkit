/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import type { planSchema } from "./infra.schema.js";

/** An SSH key in the DigitalOcean account (`/v2/account/keys`). */
export interface DoSshKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

/** A VPC (`/v2/vpcs`). `ip_range` is assigned by DigitalOcean. */
export interface DoVpc {
  id: string;
  name: string;
  region: string;
  ip_range: string;
  created_at: string;
}

/** A resource inside a VPC (`/v2/vpcs/{id}/members`). */
export interface DoVpcMember {
  urn: string;
  name: string;
}

export interface DoNetwork {
  ip_address: string;
  type: "public" | "private";
}

/** A droplet (`/v2/droplets`), only the fields perfkit reads. */
export interface DoDroplet {
  id: number;
  name: string;
  status: "new" | "active" | "off" | "archive";
  created_at: string;
  tags: string[];
  networks: { v4: DoNetwork[] };
}

export interface DoDropletCreate {
  name: string;
  region: string;
  size: string;
  image: string;
  ssh_keys: number[];
  vpc_uuid: string;
  tags: string[];
  user_data: string;
  monitoring: boolean;
  ipv6: boolean;
}

export interface DoFirewallRuleTarget {
  addresses?: string[];
  droplet_ids?: number[];
  tags?: string[];
}

export interface DoInboundRule {
  protocol: "tcp" | "udp" | "icmp";
  /** Omitted for icmp. */
  ports?: string;
  sources: DoFirewallRuleTarget;
}

export interface DoOutboundRule {
  protocol: "tcp" | "udp" | "icmp";
  /** Omitted for icmp. */
  ports?: string;
  destinations: DoFirewallRuleTarget;
}

/** The writable fields of a firewall, as `POST` and `PUT` take them. */
export interface DoFirewallInput {
  name: string;
  inbound_rules: DoInboundRule[];
  outbound_rules: DoOutboundRule[];
  droplet_ids: number[];
  tags: string[];
}

export interface DoFirewall extends DoFirewallInput {
  id: string;
  status: string;
  created_at: string;
}

/**
 * The DigitalOcean API v2, only the calls perfkit makes. The real client is
 * `createDoClient`; unit tests inject a fake. Every delete resolves when the
 * resource is already gone (404).
 */
export interface DoClient {
  listSshKeys(): Promise<DoSshKey[]>;
  /** Looks a key up by its MD5 fingerprint; null when the account lacks it. */
  getSshKey(fingerprint: string): Promise<DoSshKey | null>;
  createSshKey(input: { name: string; public_key: string }): Promise<DoSshKey>;
  deleteSshKey(id: number): Promise<void>;

  listVpcs(): Promise<DoVpc[]>;
  createVpc(input: {
    name: string;
    region: string;
    description: string;
  }): Promise<DoVpc>;
  listVpcMembers(id: string): Promise<DoVpcMember[]>;
  deleteVpc(id: string): Promise<void>;

  /** Droplets that carry the tag. */
  listDroplets(input: { tag: string }): Promise<DoDroplet[]>;
  getDroplet(id: number): Promise<DoDroplet>;
  createDroplet(input: DoDropletCreate): Promise<DoDroplet>;
  deleteDroplet(id: number): Promise<void>;

  listFirewalls(): Promise<DoFirewall[]>;
  createFirewall(input: DoFirewallInput): Promise<DoFirewall>;
  /** Replaces the firewall's rules, droplets and tags (`PUT`). */
  updateFirewall(id: string, input: DoFirewallInput): Promise<DoFirewall>;
  deleteFirewall(id: string): Promise<void>;

  deleteTag(name: string): Promise<void>;
}

/** A container registry, only to turn a tag into a digest. */
export interface RegistryClient {
  /** The manifest digest (`sha256:...`) of name:tag; null when not found. */
  getDigest(name: string, tag: string): Promise<string | null>;
}

/** The result of one command run over SSH. */
export interface SshResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Local `ssh` and `ssh-keygen`, injected so tests never spawn them. */
export interface SshTools {
  /** A new ed25519 key pair; the public key in authorized_keys format. */
  generateKeyPair(): Promise<{ privateKey: string; publicKey: string }>;
  /** The public key of an OpenSSH private key; throws when it is not one. */
  publicKeyOf(privateKey: string): Promise<string>;
  /** Runs `command` as root on `host`. Code 255 means SSH itself failed. */
  exec(input: {
    host: string;
    privateKey: string;
    command: string;
    timeoutMs: number;
    /** Ends the command early; it then resolves with code 255. */
    signal?: AbortSignal;
  }): Promise<SshResult>;
}

/** The SSH identity a run logs in with. */
export interface SshIdentity {
  privateKey: string;
  publicKey: string;
}

/** One image of perfkit.yaml, pinned: `ref` is `name:tag@digest`. */
export type ResolvedImage = Plan["images"][number];

export type DropletRole = "uut" | "loadgen";

export type DropletPlan = Plan["uut"];

/** Everything a run will create, decided before it creates anything. */
export type Plan = z.output<typeof planSchema>;

export interface CreatedDroplet {
  id: number;
  name: string;
  role: DropletRole;
  publicIp: string | null;
  privateIp: string | null;
}

/** What a run created so far; teardown deletes exactly this. */
export interface RunResources {
  runId: string;
  /** `perfkit-run-<run id>`, deleted after the droplets. */
  runTag?: string;
  sshKey?: { id: number; name: string; fingerprint: string; shared: boolean };
  vpc?: { id: string; name: string };
  droplets: CreatedDroplet[];
  firewall?: { id: string; name: string };
}

/** A run whose droplets are active and done with cloud-init. */
export interface ProvisionedRun extends RunResources {
  sshKey: NonNullable<RunResources["sshKey"]>;
  vpc: NonNullable<RunResources["vpc"]> & { ipRange: string };
  firewall: NonNullable<RunResources["firewall"]>;
  uut: CreatedDroplet & { publicIp: string; privateIp: string };
  loadgen: CreatedDroplet & { publicIp: string; privateIp: string };
  /** The private key that logs in as root on both droplets. */
  identity: SshIdentity;
}

/** What `withRun` hands its body. */
export interface RunContext {
  plan: Plan;
  run: ProvisionedRun;
  /** Aborted on SIGINT or SIGTERM; the body should stop. */
  signal: AbortSignal;
  /**
   * Hands the run off: from now on `withRun` keeps every resource on any
   * exit, and `collect` or `sweep` deletes them. Call it once the agent on
   * the droplets has started.
   */
  handOff(): void;
}

export type ResourceKind = "droplet" | "firewall" | "VPC" | "SSH key" | "tag";

export interface DeletedResource {
  kind: ResourceKind;
  id: string;
  name: string;
}

export interface DeleteFailure extends DeletedResource {
  /** Why, like `after 3 attempts: <DigitalOcean message>`. */
  reason: string;
}

export interface TeardownResult {
  deleted: DeletedResource[];
  failures: DeleteFailure[];
}

/** How `withRun` ended. Teardown failures are reported in every case. */
export type RunOutcome<T> =
  | {
      status: "completed";
      value: T;
      handedOff: boolean;
      teardown: TeardownResult;
    }
  | {
      status: "failed";
      error: unknown;
      handedOff: boolean;
      teardown: TeardownResult;
    }
  | { status: "cancelled"; signal: NodeJS.Signals; teardown: TeardownResult };

/** Where `withRun` listens for SIGINT and SIGTERM (`process` by default). */
export interface SignalSource {
  on(event: NodeJS.Signals, listener: () => void): unknown;
  off(event: NodeJS.Signals, listener: () => void): unknown;
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;
export type Now = () => number;
