/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  DoClient,
  Now,
  RegistryClient,
  RunContext,
  SignalSource,
  Sleep,
  SshTools
} from "../infra/index.js";
import type { RenderSiteDeps } from "../render/types.js";
import type { ValidateFileDeps } from "../validate/types.js";

export const EXIT_OK = 0;
export const EXIT_NOT_PASSED = 1;
export const EXIT_BAD_INPUT = 2;
export const EXIT_INFRA = 3;
export const EXIT_CANCELLED = 130;

/** `run` options the executor needs beyond the provisioned run. */
export interface RunOptions {
  out: string;
  detach: boolean;
}

/**
 * Runs the plan's benchmarks on a provisioned run. The orchestration issue
 * provides the real one; `passed` is false when at least one benchmark did
 * not pass (exit 1). With `--detach` it calls `ctx.handOff()` once its agent
 * has started.
 */
export type BenchmarkExecutor = (
  ctx: RunContext,
  options: RunOptions
) => Promise<{ passed: boolean }>;

/** Everything `run` and `sweep` reach outside the process, injected. */
export interface InfraCliDeps {
  env: { DIGITALOCEAN_TOKEN?: string; PERFKIT_SSH_KEY?: string };
  now: Now;
  sleep: Sleep;
  signals?: SignalSource;
  /** `git rev-parse HEAD` in `dir`; null outside a git checkout. */
  gitHead: (dir: string) => Promise<string | null>;
  registry: RegistryClient;
  getPublicIp: () => Promise<string>;
  createDoClient: (token: string) => DoClient;
  ssh: SshTools;
  executeBenchmarks: BenchmarkExecutor;
}

export interface CliDeps extends ValidateFileDeps, RenderSiteDeps {
  version: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  infra: InfraCliDeps;
}
