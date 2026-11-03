/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshResult, SshTools } from "./types.js";

/** Runs a program and resolves with its exit code; never rejects on a code. */
export type RunProgram = (
  file: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal }
) => Promise<SshResult>;

const SSH_OPTIONS = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=no",
  "-o",
  "UserKnownHostsFile=/dev/null",
  "-o",
  "LogLevel=ERROR",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "IdentitiesOnly=yes"
];

/**
 * Creates the SSH tools over the local `ssh` and `ssh-keygen`. A private key
 * is written to a fresh 0600 file in a 0700 temporary directory for the one
 * call that needs it, and removed right after.
 *
 * @param deps - How to run a program (injected)
 */
export function createSshTools(deps: { run: RunProgram }): SshTools {
  const withKeyFile = async <T>(
    privateKey: string | null,
    use: (keyFile: string, dir: string) => Promise<T>
  ): Promise<T> => {
    const dir = await mkdtemp(join(tmpdir(), "perfkit-ssh-"));
    const keyFile = join(dir, "id_ed25519");
    try {
      if (privateKey !== null) {
        const text = privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`;
        await writeFile(keyFile, text, { mode: 0o600 });
      }
      return await use(keyFile, dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  return {
    generateKeyPair: () =>
      withKeyFile(null, async (keyFile) => {
        const out = await deps.run(
          "ssh-keygen",
          ["-q", "-t", "ed25519", "-N", "", "-C", "perfkit", "-f", keyFile],
          { timeoutMs: 30 * 1000 }
        );
        if (out.code !== 0) {
          throw new Error(`ssh-keygen failed: ${out.stderr.trim()}`);
        }
        const [privateKey, publicKey] = await Promise.all([
          readFile(keyFile, "utf8"),
          readFile(`${keyFile}.pub`, "utf8")
        ]);
        return { privateKey, publicKey: publicKey.trim() };
      }),

    publicKeyOf: (privateKey) =>
      withKeyFile(privateKey, async (keyFile) => {
        const out = await deps.run(
          "ssh-keygen",
          ["-y", "-P", "", "-f", keyFile],
          { timeoutMs: 30 * 1000 }
        );
        if (out.code !== 0) {
          throw new Error("not an OpenSSH private key without a passphrase");
        }
        return out.stdout.trim();
      }),

    exec: ({ host, privateKey, command, timeoutMs, signal }) =>
      withKeyFile(privateKey, (keyFile) =>
        deps.run(
          "ssh",
          [...SSH_OPTIONS, "-i", keyFile, `root@${host}`, command],
          { timeoutMs, signal }
        )
      )
  };
}
