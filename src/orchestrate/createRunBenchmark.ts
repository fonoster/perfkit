/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { basename } from "node:path";
import { capacityStepWindow } from "../analyze/capacityStepWindow.js";
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import type { Now, Sleep } from "../infra/index.js";
import type { BenchmarkConfig } from "../schemas/index.js";
import {
  NODE_IMAGE,
  OTELCOL_IMAGE,
  SAMPLER_IMAGE,
  SIPP_BINARY,
  SIPP_IMAGE
} from "../tools.js";
import { buildComposeEnv } from "./buildComposeEnv.js";
import { countRegistered } from "./countRegistered.js";
import {
  buildSippRoles,
  countUserRows,
  SIPP_PROJECT_DIR,
  type SippRoleSpec
} from "./buildSippRoles.js";
import {
  composeCommand,
  type ComposeTarget,
  countComposeServices,
  isComposeUp,
  parseComposePs
} from "./composeCommands.js";
import {
  CHECK_INTERVAL_MS,
  HEALTH_POLL_MS,
  HEALTH_TIMEOUT_MS,
  MAX_FAILED_CHECKS,
  nameOf,
  REGISTER_GRACE_MS,
  REGISTER_POLL_MS,
  REGISTER_RATE,
  SIPP_START_TIMEOUT_MS,
  STEP_GRACE_MS,
  UUT_UNRESPONSIVE
} from "./constants.js";
import {
  dockerRunCommand,
  removeContainersCommand,
  stopSippCommand
} from "./dockerRunCommand.js";
import { AgentFailure, lastLine } from "./errors.js";
import { evaluateCapacityStep } from "./evaluateCapacityStep.js";
import { runPaths } from "./paths.js";
import type { RunState } from "./runState.schema.js";
import { buildOtelcolConfig, buildSamplerSpec } from "./sampler.js";
import { writeFileCommand } from "./shellQuote.js";
import type { AgentFs, Host, HostShell } from "./types.js";

export interface AgentDeps {
  shell: HostShell;
  fs: AgentFs;
  now: Now;
  sleep: Sleep;
  /** One progress line, to the agent's log and progress.log. */
  log: (line: string) => Promise<void>;
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Creates `runBenchmark(benchmark)`, one benchmark on the agent: compose up
 * on the UUT and wait until it is running and healthy (5 minutes, else an
 * AgentFailure), the setup script once, the samplers, the collector for
 * telemetry, then the SIPp roles. A capacity ramp is evaluated step by step
 * and SIPp is stopped at the first step that breaks a rule or is invalid,
 * or after the last step. A soak runs for warmup + duration. The UUT is
 * checked every 30 s; three failed checks in a row abort the benchmark with
 * the series collected so far. It ends with the raw results in #2's layout,
 * compose down and the `done` marker.
 *
 * @param deps - Host shell, file system and clock (injected)
 */
export function createRunBenchmark(deps: AgentDeps, state: RunState) {
  const paths = runPaths(state.root);
  const name = (what: string) => nameOf(state.namePrefix, state.runId, what);
  const run = async (host: Host, command: string, timeoutMs?: number) =>
    deps.shell(host, command, { timeoutMs });
  const sharedFs = state.mode === "local";

  return async (benchmark: BenchmarkConfig): Promise<void> => {
    const rawDir = paths.rawOf(benchmark.id);
    const target: ComposeTarget = {
      projectDir: paths.project,
      file: benchmark.uut.compose,
      name: name(benchmark.id),
      env: buildComposeEnv(state, benchmark)
    };
    const containers = {
      samplerUut: name(`${benchmark.id}-sampler-uut`),
      samplerLoadgen: name(`${benchmark.id}-sampler-loadgen`),
      otelcol: name(`${benchmark.id}-otelcol`),
      sipp: (role: string) => name(`${benchmark.id}-sipp-${role}`)
    };
    const projectFile = (file: string) =>
      deps.fs.readFile(`${paths.project}/${file}`);
    const registerUsers =
      benchmark.kind === "soak" && benchmark.load.register
        ? countUserRows(await projectFile(benchmark.load.register.users))
        : 0;
    const roles = buildSippRoles({
      benchmark,
      uutIp: state.hosts.uutIp,
      loadgenIp: state.hosts.loadgenIp,
      registerUsers
    });

    await deps.fs.mkdir(rawDir);
    if (!sharedFs) await run("uut", `mkdir -p ${rawDir}`);

    const cleanup = async () => {
      await run(
        "loadgen",
        removeContainersCommand([
          ...roles.map(({ role }) => containers.sipp(role)),
          containers.otelcol,
          containers.samplerLoadgen
        ])
      );
      await run("uut", removeContainersCommand([containers.samplerUut]));
      await run("uut", composeCommand(target, ["down", "--remove-orphans"]));
    };

    try {
      await startUut(benchmark, target, projectFile);
      await startSamplers(benchmark, rawDir, containers);
      if (benchmark.telemetry.otlp) {
        await startCollector(rawDir, containers.otelcol);
      }
      const started = await startSipp(
        benchmark.id,
        roles,
        rawDir,
        containers.sipp,
        registerUsers
      );
      const startedMs = started.startedMs;
      const monitored = started.aborted
        ? { steps: 0, aborted: started.aborted }
        : await monitor(benchmark, rawDir, startedMs);
      const endedMs = deps.now();
      await Promise.all(
        [...roles]
          .reverse()
          .map(({ role }) =>
            run("loadgen", stopSippCommand(containers.sipp(role)), 120_000)
          )
      );
      if (benchmark.telemetry.otlp) {
        await run(
          "loadgen",
          `docker stop -t 30 ${containers.otelcol} >/dev/null 2>&1; docker rm -f ${containers.otelcol} >/dev/null 2>&1; true`,
          60_000
        );
      }
      await run(
        "loadgen",
        removeContainersCommand([containers.samplerLoadgen])
      );
      await run("uut", removeContainersCommand([containers.samplerUut]));
      await collectUutFiles(rawDir);
      await mergeHostFiles(rawDir);
      const spans = `${rawDir}/spans.jsonl`;
      if (benchmark.telemetry.otlp && !(await deps.fs.exists(spans))) {
        // No span arrived: the collector never created its file.
        await deps.fs.writeFile(spans, "");
      }
      await writeMeta(
        benchmark,
        rawDir,
        startedMs,
        endedMs,
        monitored.steps,
        registerUsers
      );
      if (monitored.aborted) {
        await deps.fs.writeFile(`${rawDir}/aborted`, `${monitored.aborted}\n`);
        await deps.log(`[${benchmark.id}] aborted: ${monitored.aborted}`);
      }
      await run("uut", composeCommand(target, ["down", "--remove-orphans"]));
      await deps.fs.writeFile(`${rawDir}/done`, `${iso(deps.now())}\n`);
    } catch (err) {
      await cleanup();
      throw err;
    }
  };

  async function startUut(
    benchmark: BenchmarkConfig,
    target: ComposeTarget,
    projectFile: (file: string) => Promise<string>
  ) {
    const expected = countComposeServices(
      await projectFile(benchmark.uut.compose)
    );
    const up = await run(
      "uut",
      composeCommand(target, ["up", "-d"]),
      15 * 60 * 1000
    );
    if (up.code !== 0) {
      throw new AgentFailure(
        `docker compose up failed for ${benchmark.id}: ${lastLine(up.stderr, `exit ${up.code}`)}`
      );
    }
    const deadline = deps.now() + HEALTH_TIMEOUT_MS;
    const wait = async (): Promise<void> => {
      const ps = await run(
        "uut",
        composeCommand(target, ["ps", "-a", "--format", "json"])
      );
      const up = ps.code === 0 && isComposeUp(safePs(ps.stdout), expected);
      if (up) return;
      if (deps.now() >= deadline) {
        throw new AgentFailure(
          `the server under test for ${benchmark.id} was not running and healthy within 5 minutes`
        );
      }
      await deps.sleep(HEALTH_POLL_MS);
      return wait();
    };
    await wait();
    if (benchmark.uut.setup) {
      const setup = await run(
        "loadgen",
        dockerRunCommand({
          runId: state.runId,
          image: NODE_IMAGE,
          rm: true,
          volumes: [`${paths.project}:${SIPP_PROJECT_DIR}`],
          workdir: SIPP_PROJECT_DIR,
          env: target.env,
          command: ["node", benchmark.uut.setup]
        }),
        15 * 60 * 1000
      );
      if (setup.code !== 0) {
        throw new AgentFailure(
          `the setup script ${benchmark.uut.setup} exited ${setup.code}: ${lastLine(setup.stderr || setup.stdout, "no output")}`
        );
      }
    }
  }

  async function startSamplers(
    benchmark: BenchmarkConfig,
    rawDir: string,
    containers: { samplerUut: string; samplerLoadgen: string }
  ) {
    const start = async (host: Host, container: string, spec: string) => {
      const specFile = `${rawDir}/sampler-${host}.spec`;
      if (host === "loadgen" || sharedFs) {
        await deps.fs.writeFile(specFile, spec);
      } else {
        await run(host, writeFileCommand(specFile, spec));
      }
      const out = await run(
        host,
        dockerRunCommand({
          runId: state.runId,
          name: container,
          image: SAMPLER_IMAGE,
          detach: true,
          pidHost: true,
          capAdd: ["SYS_PTRACE"],
          volumes: [`${state.root}:${state.root}`],
          command: ["sh", paths.sampler, host, specFile, rawDir]
        })
      );
      if (out.code !== 0) {
        throw new AgentFailure(
          `could not start the sampler on the ${host === "uut" ? "server under test" : "load generator"}: ${lastLine(out.stderr, `exit ${out.code}`)}`
        );
      }
    };
    await start(
      "uut",
      containers.samplerUut,
      buildSamplerSpec("uut", benchmark.uut.processes)
    );
    await start(
      "loadgen",
      containers.samplerLoadgen,
      buildSamplerSpec("loadgen", [])
    );
  }

  async function startCollector(rawDir: string, container: string) {
    await deps.fs.writeFile(
      `${rawDir}/otelcol.yaml`,
      buildOtelcolConfig(state.hosts.loadgenIp, "/raw/spans.jsonl")
    );
    const out = await run(
      "loadgen",
      `chmod 777 ${rawDir} && ${dockerRunCommand({
        runId: state.runId,
        name: container,
        image: OTELCOL_IMAGE,
        detach: true,
        volumes: [`${rawDir}:/raw`],
        command: ["--config", "/raw/otelcol.yaml"]
      })}`
    );
    if (out.code !== 0) {
      throw new AgentFailure(
        `could not start the OpenTelemetry Collector: ${lastLine(out.stderr, `exit ${out.code}`)}`
      );
    }
  }

  /**
   * Starts the roles in order and returns SIPp's StartTime of the uac. With
   * a register role, the uac starts only once every callee has registered;
   * when they have not within `users / REGISTER_RATE` + 60 s, the uac never
   * starts and the benchmark is aborted with how many did.
   */
  async function startSipp(
    benchmarkId: string,
    roles: SippRoleSpec[],
    rawDir: string,
    container: (role: string) => string,
    registerUsers: number
  ): Promise<{ startedMs: number; aborted: string | null }> {
    const startRole = async (spec: SippRoleSpec) => {
      const out = await run(
        "loadgen",
        dockerRunCommand({
          runId: state.runId,
          name: container(spec.role),
          image: SIPP_IMAGE,
          detach: true,
          platform: "linux/amd64",
          ulimits: ["nofile=1048576:1048576"],
          volumes: [
            `${paths.project}:${SIPP_PROJECT_DIR}:ro`,
            `${rawDir}:/raw`
          ],
          workdir: "/raw",
          command: [SIPP_BINARY, ...spec.args]
        })
      );
      if (out.code !== 0) {
        throw new AgentFailure(
          `could not start SIPp (${spec.role}): ${lastLine(out.stderr, `exit ${out.code}`)}`
        );
      }
    };
    const uac = roles.find(({ role }) => role === "uac") as SippRoleSpec;
    const callees = roles.filter(({ role }) => role !== "uac");
    await callees.reduce(
      (previous, spec) => previous.then(() => startRole(spec)),
      Promise.resolve()
    );
    const register = callees.find(({ role }) => role === "register");
    if (register && registerUsers > 0) {
      const timeoutMs =
        Math.ceil(registerUsers / REGISTER_RATE) * 1000 + REGISTER_GRACE_MS;
      const registered = await waitForRegistrations(
        rawDir,
        register.scenario,
        registerUsers,
        deps.now() + timeoutMs
      );
      if (registered < registerUsers) {
        return {
          startedMs: deps.now(),
          aborted: `only ${registered} of ${registerUsers} callees registered within ${Math.round(timeoutMs / 1000)} s, so no call was placed`
        };
      }
      await deps.log(`[${benchmarkId}] ${registerUsers} callees registered`);
    }
    await startRole(uac);
    const startedMs = await sippStartTime(
      rawDir,
      uac.scenario,
      deps.now(),
      deps.now() + SIPP_START_TIMEOUT_MS
    );
    return { startedMs, aborted: null };
  }

  /**
   * Polls the register scenario's counts file until it shows `users`
   * registrations or the deadline passes; returns the last count read.
   */
  async function waitForRegistrations(
    rawDir: string,
    scenario: string,
    users: number,
    deadline: number
  ): Promise<number> {
    const base = basename(scenario).replace(/\.xml$/i, "");
    const names = await deps.fs.readdir(rawDir).catch(() => [] as string[]);
    const file = names.find(
      (name) => name.startsWith(`${base}_`) && name.endsWith("_counts.csv")
    );
    const registered = file
      ? countRegistered(
          await deps.fs.readFile(`${rawDir}/${file}`).catch(() => "")
        )
      : 0;
    if (registered >= users || deps.now() >= deadline) return registered;
    await deps.sleep(REGISTER_POLL_MS);
    return waitForRegistrations(rawDir, scenario, users, deadline);
  }

  async function sippStartTime(
    rawDir: string,
    scenario: string,
    fallbackMs: number,
    deadline: number
  ): Promise<number> {
    const base = basename(scenario).replace(/\.xml$/i, "");
    const names = await deps.fs.readdir(rawDir).catch(() => [] as string[]);
    const stat = names.find(
      (file) => file.startsWith(`${base}_`) && file.endsWith("_.csv")
    );
    const text = stat ? await deps.fs.readFile(`${rawDir}/${stat}`) : "";
    const epoch = /\t(\d+\.\d+);/.exec(text.split("\n")[1] ?? "")?.[1];
    if (epoch) return Math.round(Number(epoch) * 1000);
    if (deps.now() >= deadline) return fallbackMs;
    await deps.sleep(1000);
    return sippStartTime(rawDir, scenario, fallbackMs, deadline);
  }

  /**
   * Waits out the benchmark, checking the UUT every 30 s. Capacity steps are
   * evaluated 11 s after each ends, once their stat rows are on disk.
   */
  async function monitor(
    benchmark: BenchmarkConfig,
    rawDir: string,
    startedMs: number
  ): Promise<{ steps: number; aborted: string | null }> {
    let failedChecks = 0;
    let nextCheck = deps.now() + CHECK_INTERVAL_MS;
    const waitUntil = async (deadline: number): Promise<boolean> => {
      const now = deps.now();
      if (now >= deadline) return true;
      if (now >= nextCheck) {
        nextCheck = now + CHECK_INTERVAL_MS;
        const out = await run("uut", "true", 20 * 1000);
        failedChecks = out.code === 0 ? 0 : failedChecks + 1;
        if (failedChecks >= MAX_FAILED_CHECKS) return false;
      }
      await deps.sleep(Math.max(1, Math.min(deadline, nextCheck) - deps.now()));
      return waitUntil(deadline);
    };

    if (benchmark.kind === "soak") {
      const totalMs =
        (durationToSeconds(benchmark.warmup) +
          durationToSeconds(benchmark.duration)) *
        1000;
      const ok = await waitUntil(startedMs + totalMs);
      return { steps: 0, aborted: ok ? null : UUT_UNRESPONSIVE };
    }

    const { start, step, max, every } = benchmark.load.rate;
    const everyMs = durationToSeconds(every) * 1000;
    const total = Math.floor((max - start) / step) + 1;
    const runStep = async (
      index: number
    ): Promise<{ steps: number; aborted: string | null }> => {
      const ok = await waitUntil(
        startedMs + (index + 1) * everyMs + STEP_GRACE_MS
      );
      if (!ok) return { steps: Math.max(index, 1), aborted: UUT_UNRESPONSIVE };
      const evaluation = await evaluateCapacityStep({
        fs: deps.fs,
        rawDir,
        benchmark,
        index,
        startMs: startedMs
      });
      await deps.log(evaluation.line);
      if (evaluation.stop || index + 1 >= total) {
        return { steps: index + 1, aborted: null };
      }
      return runStep(index + 1);
    };
    return runStep(0);
  }

  async function collectUutFiles(rawDir: string) {
    if (sharedFs) return;
    await ["sampler-uut.jsonl", "udp-uut.jsonl"].reduce(
      (previous, file) =>
        previous.then(async () => {
          const out = await run(
            "uut",
            `cat ${rawDir}/${file} 2>/dev/null; true`,
            5 * 60 * 1000
          );
          await deps.fs.writeFile(`${rawDir}/${file}`, out.stdout);
        }),
      Promise.resolve()
    );
  }

  async function mergeHostFiles(rawDir: string) {
    const read = async (file: string) =>
      (await deps.fs.exists(`${rawDir}/${file}`))
        ? deps.fs.readFile(`${rawDir}/${file}`)
        : "";
    const merge = async (kind: "sampler" | "udp") => {
      const parts = await Promise.all(
        ["uut", "loadgen"].map((host) => read(`${kind}-${host}.jsonl`))
      );
      await deps.fs.writeFile(
        `${rawDir}/${kind}.jsonl`,
        parts.map((text) => text.slice(0, text.lastIndexOf("\n") + 1)).join("")
      );
    };
    await merge("sampler");
    await merge("udp");
  }

  async function writeMeta(
    benchmark: BenchmarkConfig,
    rawDir: string,
    startedMs: number,
    endedMs: number,
    steps: number,
    registerUsers: number
  ) {
    const tool = `SIPp ${state.tools.sipp.replace(/-.*$/, "")}, UDP${benchmark.telemetry.otlp ? "; OpenTelemetry" : ""}`;
    const base = {
      startedAt: iso(startedMs),
      endedAt: iso(endedMs),
      durationS: Math.max(0, Math.round((endedMs - startedMs) / 1000)),
      tool
    };
    const meta =
      benchmark.kind === "capacity"
        ? {
            ...base,
            kind: "capacity",
            steps: Array.from({ length: Math.max(steps, 1) }, (_, index) => {
              const window = capacityStepWindow({
                startedMs,
                index,
                everyMs: durationToSeconds(benchmark.load.rate.every) * 1000,
                warmupMs: durationToSeconds(benchmark.warmup) * 1000,
                endedMs: Math.max(endedMs, startedMs + 1)
              });
              return {
                offeredCps:
                  benchmark.load.rate.start + index * benchmark.load.rate.step,
                from: iso(window.fromMs),
                to: iso(window.toMs)
              };
            })
          }
        : {
            ...base,
            kind: "soak",
            load: {
              cps: benchmark.load.rate.cps,
              holdS: durationToSeconds(benchmark.load.hold)
            },
            registerUsers
          };
    await deps.fs.writeFile(
      `${rawDir}/meta.json`,
      `${JSON.stringify(meta, null, 2)}\n`
    );
  }
}

function safePs(stdout: string) {
  try {
    return parseComposePs(stdout);
  } catch {
    return [];
  }
}
