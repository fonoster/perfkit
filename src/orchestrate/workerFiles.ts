/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Host } from "./types.js";

/**
 * The load generator a uac instance runs on: round robin over the first
 * (`loadgen`) and its `workers`, so instance 1 is always on `loadgen`.
 */
export function generatorOf(instance: number, workers: number): Host {
  const slot = (instance - 1) % (workers + 1);
  return slot === 0 ? "loadgen" : `worker-${slot}`;
}

/**
 * The name a worker's SIPp file gets in the run's raw directory. SIPp names
 * its files after its pid (`<scenario>_<pid>_<what>`), which two machines can
 * share, so the worker's number goes in front of the pid, padded past any
 * real one: worker 1's pid 4242 becomes 100004242. Null for a file that is
 * not SIPp's (the users shares).
 */
export function workerFileName(worker: number, name: string): string | null {
  const match = /^(.+)_(\d+)_(.*)$/.exec(name);
  if (!match) return null;
  const [, base, pid, rest] = match;
  return `${base}_${worker}${(pid as string).padStart(8, "0")}_${rest}`;
}
