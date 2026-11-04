/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { SshResult } from "../infra/index.js";

export type Host = "uut" | "loadgen";

/** Runs a shell command as root on one of the run's two hosts. */
export type HostShell = (
  host: Host,
  command: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<SshResult>;

/**
 * How the CLI reaches a run: over SSH to the droplets, or the local machine
 * with --local. Paths on the host side are absolute.
 */
export interface Remote {
  exec: HostShell;
  /** Copies a local file or directory to `remotePath` on `host`. */
  upload(host: Host, localPath: string, remotePath: string): Promise<void>;
  /** Copies `remotePath` (a directory) on `host` into `localPath`. */
  download(host: Host, remotePath: string, localPath: string): Promise<void>;
}

/** The file system the agent reads and writes, injected. */
export interface AgentFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  appendFile(path: string, text: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  /** Creates a directory and its parents. */
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
