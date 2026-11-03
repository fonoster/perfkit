#!/usr/bin/env node
/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli/runCli.js";
import { EXIT_CANCELLED } from "./cli/types.js";
import {
  createDockerHubRegistry,
  createDoClient,
  createGetPublicIp,
  createSshTools,
  runProgram
} from "./infra/index.js";
import { createAgent } from "./orchestrate/createAgent.js";
import { createAgentShell } from "./orchestrate/createAgentShell.js";
import { createDockerEngine } from "./orchestrate/createDockerEngine.js";
import { createNodeAgentFs } from "./orchestrate/createNodeAgentFs.js";
import { runPaths } from "./orchestrate/paths.js";
import { runStateSchema } from "./orchestrate/runState.schema.js";

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
    runProgram,
    home: homedir(),
    packageRoot: join(dirname(fileURLToPath(import.meta.url)), ".."),
    namePrefix: process.env.PERFKIT_NAME_PREFIX || "perfkit",
    runAgent: async ({ root, runId }) => {
      const fs = createNodeAgentFs();
      const paths = runPaths(root);
      const state = runStateSchema.parse(
        JSON.parse(await fs.readFile(paths.runJson))
      );
      return createAgent({
        shell: createAgentShell({
          engine: createDockerEngine("/var/run/docker.sock"),
          state
        }),
        fs,
        now: () => Date.now(),
        sleep,
        log: async (line) => {
          process.stdout.write(`${line}\n`);
          await fs.appendFile(paths.progress, `${line}\n`);
        }
      })({ root, runId });
    }
  },
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  },
  fetchText: async (url) => {
    const response = await fetch(url, { redirect: "follow" });
    return { status: response.status, text: await response.text() };
  }
});

process.exitCode = code;
// A cancelled body may still hold timers or sockets; teardown is done.
if (code === EXIT_CANCELLED) process.exit(code);
