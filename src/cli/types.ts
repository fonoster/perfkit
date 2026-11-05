/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  DoClient,
  Now,
  RegistryClient,
  RunContext,
  RunProgram,
  SignalSource,
  Sleep,
  SshTools
} from "../infra/index.js";
import type { Closable } from "../live/types.js";
import type { AgentOutcome } from "../orchestrate/createAgent.js";
import type { LiveSettings } from "../orchestrate/runState.schema.js";
import type { PerfkitConfig } from "../schemas/index.js";
import type { RenderSiteDeps } from "../render/types.js";
import type { ValidateFileDeps } from "../validate/types.js";

export const EXIT_OK = 0;
export const EXIT_NOT_PASSED = 1;
export const EXIT_BAD_INPUT = 2;
export const EXIT_INFRA = 3;
export const EXIT_RUNNING = 4;
export const EXIT_CANCELLED = 130;

/** `run` options the executor needs beyond the provisioned run. */
export interface RunOptions {
  out: string;
  detach: boolean;
  /** The perfkit.yaml file and its parsed content. */
  configPath: string;
  config: PerfkitConfig;
  /** The command line, for report.json. */
  command: string;
  /** The run-only private key the agent logs in to the UUT with. */
  agentKey: string;
  /** Where the agent serves live.json, and its ngrok domain. */
  live?: LiveSettings;
}

/**
 * Starts the benchmarks on a provisioned run. The real one copies the
 * project and the CLI's package to the droplets, starts the agent and calls
 * `ctx.handOff()`; `run` then collects. One that never hands off ran the
 * benchmarks itself: `passed` false is exit 1.
 */
export type BenchmarkExecutor = (
  ctx: RunContext,
  options: RunOptions
) => Promise<{ passed: boolean }>;

/** Everything `run` and `sweep` reach outside the process, injected. */
export interface InfraCliDeps {
  env: {
    DIGITALOCEAN_TOKEN?: string;
    PERFKIT_SSH_KEY?: string;
    /** Opens an ngrok tunnel to live.json; never printed or written. */
    NGROK_AUTHTOKEN?: string;
    /** The static ngrok domain when perfkit.yaml has no live.domain. */
    NGROK_DOMAIN?: string;
  };
  now: Now;
  sleep: Sleep;
  signals?: SignalSource;
  /** `git rev-parse HEAD` in `dir`; null outside a git checkout. */
  gitHead: (dir: string) => Promise<string | null>;
  registry: RegistryClient;
  getPublicIp: () => Promise<string>;
  createDoClient: (token: string) => DoClient;
  ssh: SshTools;
  /** Local programs: `sh -c` with --local. */
  runProgram: RunProgram;
  /** The home directory; run keys and local runs live in ~/.perfkit/runs. */
  home: string;
  /** The directory of perfkit's own package.json, uploaded to the agent. */
  packageRoot: string;
  /** Containers are named `<prefix>-<run id>-<what>`; default `perfkit`. */
  namePrefix: string;
  /** The real executor when not set. */
  executeBenchmarks?: BenchmarkExecutor;
  /**
   * Serves a --local run's live.json from this machine while `run` or
   * `collect` follows it; absent, nothing is served.
   */
  serveLive?: (input: {
    root: string;
    live: LiveSettings;
    siteUrl: string;
  }) => Promise<Closable>;
  /** `perfkit agent`, on the load generator. */
  runAgent: (input: { root: string; runId: string }) => Promise<AgentOutcome>;
}

export interface CliDeps extends ValidateFileDeps, RenderSiteDeps {
  version: string;
  /**
   * `perfkit serve`: serves a site directory until Ctrl-C; `stopped`
   * resolves once it has stopped. Rejects when it can't listen.
   */
  serveSite?: (input: {
    site: string;
    port: number;
    host: string;
  }) => Promise<{ port: number; stopped: Promise<void> }>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  infra: InfraCliDeps;
}
