#!/usr/bin/env node
/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { notImplementedExecutor } from "./cli/notImplementedExecutor.js";
import { runCli } from "./cli/runCli.js";
import { EXIT_CANCELLED } from "./cli/types.js";
import {
  createDockerHubRegistry,
  createDoClient,
  createGetPublicIp,
  createSshTools,
  runProgram
} from "./infra/index.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

const code = await runCli(process.argv, {
  version,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: (path) => readFile(path, "utf8"),
  isFile: (path) =>
    stat(path).then(
      (stats) => stats.isFile(),
      () => false
    ),
  infra: {
    env: {
      DIGITALOCEAN_TOKEN: process.env.DIGITALOCEAN_TOKEN,
      PERFKIT_SSH_KEY: process.env.PERFKIT_SSH_KEY
    },
    now: () => Date.now(),
    sleep,
    signals: process,
    gitHead: async (dir) => {
      const out = await runProgram("git", ["-C", dir, "rev-parse", "HEAD"], {
        timeoutMs: 10 * 1000
      });
      return out.code === 0 ? out.stdout.trim() : null;
    },
    registry: createDockerHubRegistry({ fetch }),
    getPublicIp: createGetPublicIp({ fetch }),
    createDoClient: (token) => createDoClient({ token, fetch }),
    ssh: createSshTools({ run: runProgram }),
    executeBenchmarks: notImplementedExecutor
  }
});

process.exitCode = code;
// A cancelled body may still hold timers or sockets; teardown is done.
if (code === EXIT_CANCELLED) process.exit(code);
