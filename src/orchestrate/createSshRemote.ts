/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { SshTools } from "../infra/index.js";
import { lastLine } from "./errors.js";
import type { Host, Remote } from "./types.js";

const EXEC_TIMEOUT_MS = 15 * 60 * 1000;
const COPY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * The CLI's way to reach the droplets: SSH and scp as root to their public
 * IPs, with the key the CLI logs in with (never the agent's).
 */
export function createSshRemote(deps: {
  ssh: SshTools;
  privateKey: string;
  publicIps: Record<Host, string>;
}): Remote {
  const host = (role: Host) => deps.publicIps[role];
  const check = (what: string, out: { code: number; stderr: string }) => {
    if (out.code !== 0) {
      throw new Error(`${what}: ${lastLine(out.stderr, `exit ${out.code}`)}`);
    }
  };
  return {
    exec: (role, command, options = {}) =>
      deps.ssh.exec({
        host: host(role),
        privateKey: deps.privateKey,
        command,
        timeoutMs: options.timeoutMs ?? EXEC_TIMEOUT_MS,
        signal: options.signal
      }),
    upload: async (role, localPath, remotePath) => {
      check(
        `could not copy ${localPath} to the ${role} droplet`,
        await deps.ssh.upload({
          host: host(role),
          privateKey: deps.privateKey,
          localPath,
          remotePath,
          timeoutMs: COPY_TIMEOUT_MS
        })
      );
    },
    download: async (role, remotePath, localPath) => {
      check(
        `could not download ${remotePath} from the ${role} droplet`,
        await deps.ssh.download({
          host: host(role),
          privateKey: deps.privateKey,
          remotePath,
          localPath,
          timeoutMs: COPY_TIMEOUT_MS
        })
      );
    }
  };
}
