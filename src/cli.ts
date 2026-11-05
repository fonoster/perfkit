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
import {
  LIVE_DEFAULT_HOST,
  LIVE_DEFAULT_PORT,
  LIVE_LINGER_MS
} from "./live/constants.js";
import { createLiveRecorder } from "./live/createLiveRecorder.js";
import { createNodeServeLive } from "./live/createNodeServeLive.js";
import { createWriteLive } from "./live/createWriteLive.js";
import { listenHttp } from "./live/listenHttp.js";
import { runWithLive } from "./live/runWithLive.js";
import { createNodeServeSite } from "./serve/createNodeServeSite.js";
import { LIVE_INTERVAL_S } from "./schemas/index.js";

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

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The built app from dist; from src (tsx), a fresh bundle of src. */
async function appBundle(): Promise<string> {
  if (import.meta.url.endsWith(".ts")) {
    const { bundleApp } = await import("./render/app/bundleApp.js");
    return bundleApp(version);
  }
  return readFile(join(packageRoot, "dist", "app", "app.js"), "utf8");
}

const code = await runCli(process.argv, {
  version,
  appBundle,
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
      PERFKIT_SSH_KEY: process.env.PERFKIT_SSH_KEY,
      NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN,
      NGROK_DOMAIN: process.env.NGROK_DOMAIN
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
    packageRoot,
    namePrefix: process.env.PERFKIT_NAME_PREFIX || "perfkit",
    runAgent: async ({ root, runId }) => {
      const fs = createNodeAgentFs();
      const paths = runPaths(root);
      const state = runStateSchema.parse(
        JSON.parse(await fs.readFile(paths.runJson))
      );
      const shell = createAgentShell({
        engine: createDockerEngine("/var/run/docker.sock"),
        state
      });
      const recorder = createLiveRecorder();
      const now = () => Date.now();
      const log = async (line: string) => {
        process.stdout.write(`${line}\n`);
        await fs.appendFile(paths.progress, `${line}\n`);
      };
      const writeLive = createWriteLive({ fs, shell, now, state, recorder });
      // With --local the CLI serves live.json on this machine; the agent
      // serves it on a droplet, where nothing else can.
      const remote = state.mode === "digitalocean";
      return runWithLive(
        {
          writeLive: () => writeLive({}),
          serve: async () =>
            remote
              ? createNodeServeLive({
                  file: paths.live,
                  siteUrl: state.config.project.siteUrl,
                  log: (line) =>
                    log(line.replace(/^perfkit:/, "perfkit agent:"))
                })({
                  siteUrl: state.config.project.siteUrl,
                  port: state.live?.port ?? LIVE_DEFAULT_PORT,
                  host: LIVE_DEFAULT_HOST,
                  token: process.env.NGROK_AUTHTOKEN || null,
                  domain: state.live?.domain ?? null
                })
              : { close: async () => {} },
          sleep,
          intervalMs: LIVE_INTERVAL_S * 1000,
          lingerMs: remote ? LIVE_LINGER_MS : 0
        },
        () =>
          createAgent({ shell, fs, now, sleep, log, live: recorder })({
            root,
            runId
          })
      );
    },
    serveLive: async ({ root, live, siteUrl }) =>
      createNodeServeLive({
        file: runPaths(root).live,
        siteUrl,
        log: async (line) => {
          process.stderr.write(`${line}\n`);
        }
      })({
        siteUrl,
        port: live.port,
        host: LIVE_DEFAULT_HOST,
        token: process.env.NGROK_AUTHTOKEN || null,
        domain: live.domain
      })
  },
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  },
  serveSite: async ({ site, port, host }) => {
    const server = await listenHttp(createNodeServeSite(site), { port, host });
    const stopped = new Promise<void>((resolve) => {
      const stop = () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        server.close().then(resolve);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
    return { port: server.port, stopped };
  },
  fetchText: async (url) => {
    const response = await fetch(url, { redirect: "follow" });
    return { status: response.status, text: await response.text() };
  }
});

process.exitCode = code;
// A cancelled body may still hold timers or sockets; teardown is done.
if (code === EXIT_CANCELLED) process.exit(code);
