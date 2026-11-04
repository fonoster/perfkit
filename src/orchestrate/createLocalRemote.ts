/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { cp } from "node:fs/promises";
import type { RunProgram } from "../infra/index.js";
import type { Remote } from "./types.js";

/**
 * `--local`: both hosts are this machine. Commands run with `sh -c` and
 * copies are plain file copies.
 */
export function createLocalRemote(deps: { run: RunProgram }): Remote {
  const copy = async (from: string, to: string) => {
    await cp(from, to, { recursive: true, force: true });
  };
  return {
    exec: (_host, command, options = {}) =>
      deps.run("sh", ["-c", command], {
        timeoutMs: options.timeoutMs ?? 15 * 60 * 1000,
        signal: options.signal
      }),
    upload: (_host, localPath, remotePath) => copy(localPath, remotePath),
    download: (_host, remotePath, localPath) => copy(remotePath, localPath)
  };
}
