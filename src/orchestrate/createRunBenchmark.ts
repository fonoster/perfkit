/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { basename, dirname } from "node:path";
import { capacityStepWindow } from "../analyze/capacityStepWindow.js";
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import type { Now, Sleep } from "../infra/index.js";
import {
  type BenchmarkConfig,
  calleeInstancesOf,
  type ComposeUutConfig,
  type HelmUutConfig,
  isHelmUut,
  targetOf
} from "../schemas/index.js";
import type { RateSource } from "../analyze/rawResults.schema.js";
import {
  METRICS_SERVER_CHART,
  NODE_IMAGE,
  OTELCOL_IMAGE,
  SAMPLER_IMAGE,
  SIPP_BINARY,
  SIPP_IMAGE
} from "../tools.js";
import { arePodsReady } from "./arePodsReady.js";
import { buildComposeEnv } from "./buildComposeEnv.js";
import { buildHelmEnv } from "./buildHelmEnv.js";
import { buildKubeSamplerSpec } from "./buildKubeSamplerSpec.js";
import { entryAddressOf } from "./entryAddressOf.js";
import { kubeCommand } from "./kubeCommand.js";
import { renderHelmValues } from "./renderHelmValues.js";
import { toKubeSamplerLines } from "./toKubeSamplerLines.js";
import { countRegistered } from "./countRegistered.js";
import {
  buildSippRoles,
  registerUsersFileOf,
  shareSizeOf,
  splitUsers,
  uacUsersFileOf,
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
  CLUSTER_UNRESPONSIVE,
  ENTRY_TIMEOUT_MS,
  HEALTH_POLL_MS,
  HELM_RELEASE,
  HEALTH_TIMEOUT_MS,
  MAX_FAILED_CHECKS,
  nameOf,
  REGISTER_GRACE_MS,
  REGISTER_POLL_MS,
  REGISTER_RATE,
  SIPP_LANES,
  SIPP_START_TIMEOUT_MS,
  SIPP_TCP_NOFILE,
  roleOf,
  type SippRole,
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
import { shellJoin, shellQuote, writeFileCommand } from "./shellQuote.js";
import type { LiveRecorder } from "../live/types.js";
import { generatorOf as generatorFor, workerFileName } from "./workerFiles.js";
import { AGENT_SSH_OPTIONS, agentKeyPath } from "./createAgentShell.js";
import {
  type AgentFs,
  type Host,
  type HostShell,
  workerIndexOf
} from "./types.js";

export interface AgentDeps {
  shell: HostShell;
  fs: AgentFs;
  now: Now;
  sleep: Sleep;
  /** One progress line, to the agent's log and progress.log. */
  log: (line: string) => Promise<void>;
  /** Notes for live.json; absent in tests that don't look at it. */
  live?: LiveRecorder;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** What the agent decided for a soak with `rate.fromCapacity`. */
export interface BenchmarkRate {
  cps: number;
  rateSource: RateSource;
}

/**
 * Creates `runBenchmark(benchmark)`, one benchmark on the agent. On the
 * server: compose up on the UUT and wait until it is running and healthy (5
 * minutes, else an AgentFailure) and the setup script once. On the cluster:
 * metrics-server, the chart with its values, the entry Service's address,
 * one `helm upgrade` with PERFKIT_ENTRY_IP resolved, every pod Ready and
 * the setup script. Then the samplers, the collector for telemetry, then
 * the SIPp roles. A capacity ramp is evaluated step by step and SIPp is
 * stopped at the first step that breaks a rule or is invalid, or after the
 * last step. A soak runs for warmup + duration. The UUT (or the cluster's
 * API) is checked every 30 s; three failed checks in a row abort the
 * benchmark with the series collected so far. It ends with the raw results
 * in #2's layout, compose down (helm uninstall) and the `done` marker.
 *
 * @param deps - Host shell, file system and clock (injected)
 */
export function createRunBenchmark(deps: AgentDeps, state: RunState) {
  const paths = runPaths(state.root);
  const name = (what: string) => nameOf(state.namePrefix, state.runId, what);
  const run = async (host: Host, command: string, timeoutMs?: number) =>
    deps.shell(host, command, { timeoutMs });
  const sharedFs = state.mode === "local";
  const kube = (
    script: string,
    timeoutMs?: number,
    options?: Parameters<typeof kubeCommand>[2]
  ) => run("loadgen", kubeCommand(state, script, options), timeoutMs);

  const workers = state.hosts.workers;
  const generatorOf = (instance: number): Host =>
    generatorFor(instance, workers.length);
  /** Every uac and callee instance runs on the generator its number maps to. */
  const hostOf = (_role: SippRole, instance: number): Host =>
    generatorOf(instance);
  const workerHosts = workers.map((_, index): Host => `worker-${index + 1}`);
  /** `ssh` to a worker's private address, from the load generator. */
  const sshTo = (index: number) =>
    `ssh ${AGENT_SSH_OPTIONS} -i ${shellQuote(agentKeyPath(state.root))} root@${workers[index - 1]!.privateIp}`;

  /** Copies the named files of `rawDir` to the same directory on a worker. */
  const pushToWorker = async (
    index: number,
    rawDir: string,
    files: string[]
  ) => {
    const out = await run(
      "loadgen",
      `tar -C ${shellQuote(rawDir)} -cf - ${files.map((file) => shellQuote(file)).join(" ")} | ${sshTo(index)} ${shellQuote(`mkdir -p ${rawDir} && tar -C ${rawDir} -xf -`)}`,
      5 * 60 * 1000
    );
    if (out.code !== 0) {
      throw new AgentFailure(
        `could not copy the users to worker-${index}: ${lastLine(out.stderr, `exit ${out.code}`)}`
      );
    }
  };

  /**
   * Copies what the workers' SIPp processes wrote into `rawDir`, so the
   * agent reads every load generator's files from one directory. SIPp names
   * them after its pid, which two machines can share, so each worker's pids
   * get the worker's number in front and are padded past any real pid:
   * worker 1's pid 4242 is 100004242.
   *
   * @param strict - Fail when a worker can't be read; during a run it only
   *   means the next pull has more to copy
   */
  const pullWorkers = async (rawDir: string, strict: boolean) => {
    await Promise.all(
      workers.map(async (_, position) => {
        const index = position + 1;
        const stage = `${rawDir}/.pull-${index}`;
        await deps.fs.mkdir(stage);
        const out = await run(
          "loadgen",
          `${sshTo(index)} ${shellQuote(`tar -C ${rawDir} -cf - .`)} | tar -C ${shellQuote(stage)} -xf -`,
          5 * 60 * 1000
        );
        if (out.code !== 0 && strict) {
          throw new AgentFailure(
            `could not read the results of worker-${index}: ${lastLine(out.stderr, `exit ${out.code}`)}`
          );
        }
        const names = await deps.fs.readdir(stage).catch(() => [] as string[]);
        await Promise.all(
          names.map(async (name) => {
            const renamed = workerFileName(index, name);
            if (renamed === null) return;
            await deps.fs.rename(`${stage}/${name}`, `${rawDir}/${renamed}`);
          })
        );
      })
    );
  };

  return async (
    benchmark: BenchmarkConfig,
    rate?: BenchmarkRate
  ): Promise<void> => {
    const rawDir = paths.rawOf(benchmark.id);
    const onCluster = targetOf(benchmark) === "cluster";
    const cluster = state.cluster;
    if (onCluster && !cluster) {
      throw new AgentFailure(
        `${benchmark.id} has uut.helm, but the run has no Kubernetes cluster`
      );
    }
    const helm = isHelmUut(benchmark.uut) ? benchmark.uut.helm : null;
    const target: ComposeTarget | null = isHelmUut(benchmark.uut)
      ? null
      : {
          projectDir: paths.project,
          file: benchmark.uut.compose,
          name: name(benchmark.id),
          env: buildComposeEnv(state, benchmark)
        };
    const lane = SIPP_LANES[targetOf(benchmark)];
    const containers = {
      samplerUut: name(`${benchmark.id}-sampler-uut`),
      samplerLoadgen: name(`${benchmark.id}-sampler-loadgen`),
      samplerWorker: (index: number) =>
        name(`${benchmark.id}-sampler-worker-${index}`),
      otelcol: name(`${benchmark.id}-otelcol`),
      sipp: (role: string, instance = 1) =>
        name(`${benchmark.id}-sipp-${roleOf(role as SippRole, instance)}`)
    };
    const instances = benchmark.load.instances;
    const uacInstances = Array.from({ length: instances }, (_, i) => i + 1);
    const calleeInstances = Array.from(
      { length: calleeInstancesOf(benchmark.load) },
      (_, i) => i + 1
    );
    const onGenerator = (host: Host) =>
      [
        ...uacInstances.map((instance) => ["uac", instance] as const),
        ...calleeInstances.flatMap((instance) => [
          ["register", instance] as const,
          ["uas", instance] as const
        ])
      ]
        .filter(([role, instance]) => hostOf(role, instance) === host)
        .map(([role, instance]) => containers.sipp(role, instance));
    const allSipp = onGenerator("loadgen");
    /** An instance on a worker binds to that worker's own address. */
    const addressesOf = (list: number[]) =>
      Object.fromEntries(
        list.flatMap((instance) => {
          const worker = workerIndexOf(generatorOf(instance));
          if (worker === null) return [];
          const address = workers[worker - 1]!;
          return [[instance, onCluster ? address.publicIp : address.privateIp]];
        })
      ) as Record<number, string>;
    const uacIps = addressesOf(uacInstances);
    const calleeIps = addressesOf(calleeInstances);
    if (instances > 1 && onCluster && cluster?.fixedIps) {
      throw new AgentFailure(
        `${benchmark.id} has load.instances ${instances}, which a local cluster's fixed SIPp addresses don't allow; run it with one instance or on DigitalOcean`
      );
    }
    const projectFile = (file: string) =>
      deps.fs.readFile(`${paths.project}/${file}`);
    const registerUsers = benchmark.load.register
      ? countUserRows(await projectFile(benchmark.load.register.users))
      : 0;
    const buildRoles = (entry: { ip: string; port: number } | null) =>
      buildSippRoles({
        benchmark,
        runId: state.runId,
        uutIp: state.hosts.uutIp,
        loadgenIp:
          cluster && onCluster ? cluster.sippIps.uac : state.hosts.loadgenIp,
        registerUsers,
        ...(entry ? { target: entry } : {}),
        ...(rate ? { cps: rate.cps } : {}),
        ...(cluster && onCluster && cluster.fixedIps
          ? { bindIps: cluster.sippIps }
          : {}),
        uacIps,
        calleeIps
      });
    // Fails early, before anything starts, when the rate is missing.
    if (!onCluster) buildRoles(null);

    await deps.fs.mkdir(rawDir);
    if (!sharedFs && !onCluster) await run("uut", `mkdir -p ${rawDir}`);

    const uutDown = async () => {
      if (target) {
        await run("uut", composeCommand(target, ["down", "--remove-orphans"]));
        return;
      }
      await kube(
        `helm uninstall ${HELM_RELEASE} -n ${shellQuote(benchmark.id)} --wait --timeout 5m >/dev/null 2>&1; kubectl delete namespace ${shellQuote(benchmark.id)} --wait=true --timeout=5m >/dev/null 2>&1; true`,
        12 * 60 * 1000
      );
    };
    /** Stops the samplers of the other load generators, so their files are whole. */
    const removeWorkerSamplers = () =>
      Promise.all(
        workerHosts.map((host, position) =>
          run(
            host,
            removeContainersCommand([containers.samplerWorker(position + 1)])
          )
        )
      );
    const removeUutSampler = () =>
      onCluster
        ? run("loadgen", removeContainersCommand([containers.samplerUut]))
        : run("uut", removeContainersCommand([containers.samplerUut]));

    const cleanup = async () => {
      await Promise.all(
        workerHosts.map((host, position) =>
          run(
            host,
            removeContainersCommand([
              ...onGenerator(host),
              containers.samplerWorker(position + 1)
            ])
          )
        )
      );
      await run(
        "loadgen",
        removeContainersCommand([
          ...allSipp,
          containers.otelcol,
          containers.samplerLoadgen
        ])
      );
      await removeUutSampler();
      await uutDown();
    };

    try {
      const entry = target
        ? (await startUut(benchmark, target, projectFile), null)
        : await startCluster(
            benchmark,
            helm as HelmUutConfig["helm"],
            projectFile
          );
      const roles = buildRoles(entry);
      if (rate) deps.live?.rate?.(benchmark.id, rate.cps);
      await startSamplers(benchmark, rawDir, containers, lane.prefix);
      if (benchmark.telemetry.otlp) {
        await startCollector(rawDir, containers.otelcol);
      }
      const started = await startSipp(
        benchmark,
        roles,
        rawDir,
        containers.sipp,
        registerUsers
      );
      const startedMs = started.startedMs;
      if (!started.aborted) deps.live?.loadStarted(benchmark.id, startedMs);
      const monitored = started.aborted
        ? { steps: 0, aborted: started.aborted }
        : await monitor(benchmark, rawDir, startedMs);
      const endedMs = deps.now();
      await Promise.all(
        [...roles]
          .reverse()
          .map(({ role, instance }) =>
            run(
              hostOf(role, instance),
              stopSippCommand(containers.sipp(role, instance)),
              120_000
            )
          )
      );
      await removeWorkerSamplers();
      await pullWorkers(rawDir, true);
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
      await removeUutSampler();
      if (onCluster) {
        await convertKubeSamples(rawDir);
      } else {
        await collectUutFiles(rawDir);
      }
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
        registerUsers,
        rate
      );
      if (monitored.aborted) {
        await deps.fs.writeFile(`${rawDir}/aborted`, `${monitored.aborted}\n`);
        await deps.log(`[${benchmark.id}] aborted: ${monitored.aborted}`);
      }
      await uutDown();
      await deps.fs.writeFile(`${rawDir}/done`, `${iso(deps.now())}\n`);
    } catch (err) {
      await cleanup();
      throw err;
    }
  };

  /**
   * Installs a helm benchmark's chart on the cluster as release `perfkit`
   * in the namespace named after the benchmark and returns where SIPp
   * sends: the entry Service's load balancer address (DigitalOcean's, or
   * MetalLB's on kind) and its port.
   */
  async function startCluster(
    benchmark: BenchmarkConfig,
    helm: HelmUutConfig["helm"],
    projectFile: (file: string) => Promise<string>
  ): Promise<{ ip: string; port: number }> {
    const ns = benchmark.id;
    const must = async (what: string, script: string, timeoutMs: number) => {
      const out = await kube(script, timeoutMs);
      if (out.code !== 0) {
        throw new AgentFailure(
          `${what} for ${benchmark.id}: ${lastLine(out.stderr || out.stdout, `exit ${out.code}`)}`
        );
      }
      return out.stdout;
    };
    const poll = async <T>(
      deadline: number,
      read: () => Promise<T | null>,
      timedOut: () => string
    ): Promise<T> => {
      const value = await read();
      if (value !== null) return value;
      if (deps.now() >= deadline) throw new AgentFailure(timedOut());
      await deps.sleep(HEALTH_POLL_MS);
      return poll(deadline, read, timedOut);
    };

    await must(
      "could not install metrics-server",
      shellJoin([
        "helm",
        "upgrade",
        "--install",
        METRICS_SERVER_CHART.name,
        METRICS_SERVER_CHART.name,
        "--repo",
        METRICS_SERVER_CHART.repo,
        "--version",
        METRICS_SERVER_CHART.version,
        "-n",
        "kube-system",
        "--set",
        "args={--kubelet-insecure-tls}",
        "--wait",
        "--timeout",
        "5m"
      ]),
      10 * 60 * 1000
    );

    const valuesText = await projectFile(helm.values);
    const valuesFile = paths.valuesOf(benchmark.id);
    const writeValues = async (entryIp: string | null) => {
      let text: string;
      try {
        text = renderHelmValues(
          valuesText,
          buildHelmEnv(state, entryIp),
          helm.values
        );
      } catch (err) {
        throw new AgentFailure(
          `${benchmark.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await deps.fs.mkdir(dirname(valuesFile));
      await deps.fs.writeFile(valuesFile, text);
    };
    // Helm 4 applies server-side and needs --force-conflicts; Helm 3 lacks it.
    const upgrade = (extra: string[]) =>
      `${shellJoin([
        "helm",
        "upgrade",
        "--install",
        HELM_RELEASE,
        paths.chartOf(benchmark.id),
        "-n",
        ns,
        "--create-namespace",
        "-f",
        valuesFile,
        ...extra
      ])} $(helm version --short 2>/dev/null | grep -q '^v4' && echo --force-conflicts)`;

    await writeValues(null);
    await must(
      "helm install failed",
      upgrade(["--timeout", "15m"]),
      20 * 60 * 1000
    );
    const entry = await poll(
      deps.now() + ENTRY_TIMEOUT_MS,
      async () => {
        const out = await kube(
          shellJoin(["kubectl", "get", "services", "-n", ns, "-o", "json"]),
          60 * 1000
        );
        return out.code === 0
          ? entryAddressOf(out.stdout, helm.entry.service, helm.entry.port)
          : null;
      },
      () =>
        `the entry Service ${helm.entry.service} of ${benchmark.id} had no load balancer address for port ${helm.entry.port} within 10 minutes`
    );
    await deps.log(
      `[${benchmark.id}] entry ${helm.entry.service} at ${entry.ip}:${entry.port}`
    );
    await writeValues(entry.ip);
    await must(
      "helm upgrade failed",
      upgrade(["--wait", "--timeout", "15m"]),
      20 * 60 * 1000
    );
    await poll(
      deps.now() + HEALTH_TIMEOUT_MS,
      async () => {
        const out = await kube(
          shellJoin(["kubectl", "get", "pods", "-n", ns, "-o", "json"]),
          60 * 1000
        );
        return out.code === 0 && arePodsReady(out.stdout).ready ? true : null;
      },
      () => `the pods of ${benchmark.id} were not all Ready within 5 minutes`
    );

    if (helm.setup) {
      const users = [
        benchmark.load.register?.users,
        benchmark.load.uac.users
      ].filter((file): file is string => file !== undefined);
      const setup = await kube(
        shellJoin(["bash", helm.setup, ns, ...users]),
        15 * 60 * 1000,
        { workdir: paths.project, env: buildHelmEnv(state, entry.ip) }
      );
      if (setup.code !== 0) {
        throw new AgentFailure(
          `the setup script ${helm.setup} exited ${setup.code}: ${lastLine(setup.stderr || setup.stdout, "no output")}`
        );
      }
    }
    return entry;
  }

  async function startUut(
    benchmark: BenchmarkConfig,
    target: ComposeTarget,
    projectFile: (file: string) => Promise<string>
  ) {
    const uut = benchmark.uut as ComposeUutConfig;
    const expected = countComposeServices(await projectFile(uut.compose));
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
    if (uut.setup) {
      const setup = await run(
        "loadgen",
        dockerRunCommand({
          runId: state.runId,
          image: NODE_IMAGE,
          rm: true,
          volumes: [`${paths.project}:${SIPP_PROJECT_DIR}`],
          workdir: SIPP_PROJECT_DIR,
          env: target.env,
          command: ["node", uut.setup]
        }),
        15 * 60 * 1000
      );
      if (setup.code !== 0) {
        throw new AgentFailure(
          `the setup script ${uut.setup} exited ${setup.code}: ${lastLine(setup.stderr || setup.stdout, "no output")}`
        );
      }
    }
  }

  async function startSamplers(
    benchmark: BenchmarkConfig,
    rawDir: string,
    containers: {
      samplerUut: string;
      samplerLoadgen: string;
      samplerWorker: (index: number) => string;
    },
    prefix: string
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
          `could not start the sampler on the ${host === "uut" ? "server under test" : host === "loadgen" ? "load generator" : host}: ${lastLine(out.stderr, `exit ${out.code}`)}`
        );
      }
    };
    if (isHelmUut(benchmark.uut)) {
      const specFile = `${rawDir}/sampler-kube.spec`;
      await deps.fs.writeFile(
        specFile,
        buildKubeSamplerSpec(benchmark.uut.helm.pods)
      );
      const out = await kube(
        shellJoin(["sh", paths.kubeSampler, specFile, rawDir, benchmark.id]),
        undefined,
        { name: containers.samplerUut }
      );
      if (out.code !== 0) {
        throw new AgentFailure(
          `could not start the sampler of the Kubernetes cluster: ${lastLine(out.stderr, `exit ${out.code}`)}`
        );
      }
    } else {
      await start(
        "uut",
        containers.samplerUut,
        buildSamplerSpec("uut", benchmark.uut.processes)
      );
    }
    // Every load generator samples its own SIPp processes (the names are one
    // per instance, so the spec is the same on all of them) and UDP counters
    const loadgenSpec = buildSamplerSpec(
      "loadgen",
      [],
      prefix,
      benchmark.load.instances,
      calleeInstancesOf(benchmark.load)
    );
    await start("loadgen", containers.samplerLoadgen, loadgenSpec);
    await Promise.all(
      workerHosts.map((host, position) =>
        start(host, containers.samplerWorker(position + 1), loadgenSpec)
      )
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
    benchmark: BenchmarkConfig,
    roles: SippRoleSpec[],
    rawDir: string,
    container: (role: string, instance?: number) => string,
    registerUsers: number
  ): Promise<{ startedMs: number; aborted: string | null }> {
    const benchmarkId = benchmark.id;
    const cluster =
      targetOf(benchmark) === "cluster" ? state.cluster : undefined;
    const nofile =
      benchmark.load.transport === "tcp" ? SIPP_TCP_NOFILE : 1048576;
    const startRole = async (spec: SippRoleSpec) => {
      const out = await run(
        hostOf(spec.role, spec.instance),
        dockerRunCommand({
          runId: state.runId,
          name: container(spec.role, spec.instance),
          image: SIPP_IMAGE,
          detach: true,
          // Several uac or callee processes each get their own pid, so their
          // trace files (<scenario>_<pid>_.csv) don't overwrite one another
          ...(benchmark.load.instances > 1 &&
          (spec.role === "uac" || calleeInstancesOf(benchmark.load) > 1)
            ? { pidHost: true }
            : {}),
          platform: "linux/amd64",
          ...(cluster
            ? {
                network: cluster.network,
                ...(cluster.fixedIps ? { ip: cluster.sippIps[spec.role] } : {})
              }
            : {}),
          ulimits: [`nofile=${nofile}:${nofile}`],
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
          `could not start SIPp (${roleOf(spec.role, spec.instance)}): ${lastLine(out.stderr, `exit ${out.code}`)}`
        );
      }
    };
    const uacs = roles.filter(({ role }) => role === "uac");
    const uac = uacs[0] as SippRoleSpec;
    const callees = roles.filter(({ role }) => role !== "uac");
    const registers = callees.filter(({ role }) => role === "register");
    /** Writes each instance's share of a users file into /raw. */
    const writeShares = async (
      text: string,
      instances: number,
      fileOf: (instance: number) => string
    ) => {
      const shares = (() => {
        try {
          return splitUsers(text, instances);
        } catch (err) {
          throw new AgentFailure(`${benchmarkId}: ${(err as Error).message}`);
        }
      })();
      await Promise.all(
        shares.map((share, index) =>
          deps.fs.writeFile(`${rawDir}/${fileOf(index + 1)}`, share)
        )
      );
    };
    if (uacs.length > 1 && benchmark.load.uac.users) {
      await writeShares(
        await deps.fs.readFile(`${paths.project}/${benchmark.load.uac.users}`),
        uacs.length,
        uacUsersFileOf
      );
    }
    if (registers.length > 1 && benchmark.load.register) {
      await writeShares(
        await deps.fs.readFile(
          `${paths.project}/${benchmark.load.register.users}`
        ),
        registers.length,
        registerUsersFileOf
      );
    }
    // Each worker gets the shares of the instances it runs: callers and callees
    await Promise.all(
      workers.map((_, position) => {
        const index = position + 1;
        const here = (spec: SippRoleSpec) =>
          generatorOf(spec.instance) === `worker-${index}`;
        // A worker only runs instances 2 and up, so the shares exist
        const own = [
          ...(benchmark.load.uac.users
            ? uacs.filter(here).map(({ instance }) => uacUsersFileOf(instance))
            : []),
          ...registers
            .filter(here)
            .map(({ instance }) => registerUsersFileOf(instance))
        ];
        return own.length > 0
          ? pushToWorker(index, rawDir, own)
          : run(`worker-${index}`, `mkdir -p ${shellQuote(rawDir)}`);
      })
    );
    await callees.reduce(
      (previous, spec) => previous.then(() => startRole(spec)),
      Promise.resolve()
    );
    if (registers.length > 0 && registerUsers > 0) {
      const biggest = shareSizeOf(registerUsers, registers.length, 1);
      const timeoutMs =
        Math.ceil(biggest / REGISTER_RATE) * 1000 + REGISTER_GRACE_MS;
      const deadline = deps.now() + timeoutMs;
      const seconds = Math.round(timeoutMs / 1000);
      if (registers.length === 1) {
        const registered = await waitForRegistrations(
          rawDir,
          (registers[0] as SippRoleSpec).scenario,
          registerUsers,
          deadline
        );
        if (registered < registerUsers) {
          return {
            startedMs: deps.now(),
            aborted: `only ${registered} of ${registerUsers} callees registered within ${seconds} s, so no call was placed`
          };
        }
      } else {
        const counts = await waitForCalleeRegistrations(
          registers,
          rawDir,
          registerUsers,
          deadline,
          (instance) => container("register", instance)
        );
        const short = counts.filter(
          ({ registered, expected }) => registered < expected
        );
        if (short.length > 0) {
          return {
            startedMs: deps.now(),
            aborted: `${short
              .map(
                ({ instance, registered, expected }) =>
                  `callee ${instance} registered ${registered} of ${expected}`
              )
              .join(", ")} within ${seconds} s, so no call was placed`
          };
        }
      }
      await deps.log(`[${benchmarkId}] ${registerUsers} callees registered`);
    }
    await Promise.all(uacs.map((spec) => startRole(spec)));
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

  /**
   * Polls every callee instance's counts file until each shows its share of
   * the users registered or the deadline passes; returns each one's last
   * count. A callee's file is named after its pid: with several callees each
   * runs in the host's pid namespace, so the pid is the container's own, and
   * a worker's file is read on the worker.
   */
  async function waitForCalleeRegistrations(
    registers: SippRoleSpec[],
    rawDir: string,
    totalUsers: number,
    deadline: number,
    container: (instance: number) => string
  ): Promise<
    Array<{ instance: number; registered: number; expected: number }>
  > {
    const pids = new Map<number, string>();
    const countOf = async (spec: SippRoleSpec): Promise<number> => {
      const host = hostOf(spec.role, spec.instance);
      if (!pids.has(spec.instance)) {
        const out = await run(
          host,
          `docker inspect -f '{{.State.Pid}}' ${shellQuote(container(spec.instance))}`,
          60_000
        );
        const pid = out.stdout.trim();
        if (out.code === 0 && /^\d+$/.test(pid)) pids.set(spec.instance, pid);
      }
      const pid = pids.get(spec.instance);
      if (pid === undefined) return 0;
      const base = basename(spec.scenario).replace(/\.xml$/i, "");
      const file = `${base}_${pid}_counts.csv`;
      const text =
        host === "loadgen"
          ? await deps.fs.readFile(`${rawDir}/${file}`).catch(() => "")
          : (
              await run(
                host,
                `cat ${shellQuote(`${rawDir}/${file}`)} 2>/dev/null; true`,
                60_000
              )
            ).stdout;
      return countRegistered(text);
    };
    const read = async () =>
      Promise.all(
        registers.map(async (spec) => ({
          instance: spec.instance,
          registered: await countOf(spec),
          expected: shareSizeOf(totalUsers, registers.length, spec.instance)
        }))
      );
    const counts = await read();
    if (
      counts.every(({ registered, expected }) => registered >= expected) ||
      deps.now() >= deadline
    ) {
      return counts;
    }
    await deps.sleep(REGISTER_POLL_MS);
    return waitForCalleeRegistrations(
      registers,
      rawDir,
      totalUsers,
      deadline,
      container
    );
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
    const onCluster = targetOf(benchmark) === "cluster";
    const unresponsive = onCluster ? CLUSTER_UNRESPONSIVE : UUT_UNRESPONSIVE;
    let failedChecks = 0;
    let nextCheck = deps.now() + CHECK_INTERVAL_MS;
    const waitUntil = async (deadline: number): Promise<boolean> => {
      const now = deps.now();
      if (now >= deadline) return true;
      if (now >= nextCheck) {
        nextCheck = now + CHECK_INTERVAL_MS;
        const out = onCluster
          ? await kube("kubectl get --raw=/readyz >/dev/null", 60 * 1000)
          : await run("uut", "true", 20 * 1000);
        failedChecks = out.code === 0 ? 0 : failedChecks + 1;
        if (failedChecks >= MAX_FAILED_CHECKS) return false;
        await pullWorkers(rawDir, false);
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
      return { steps: 0, aborted: ok ? null : unresponsive };
    }

    const { start, step, max, every } = benchmark.load.rate;
    const everyMs = durationToSeconds(every) * 1000;
    const total = Math.floor((max - start) / step) + 1;
    const runStep = async (
      index: number,
      priorBreaks: number
    ): Promise<{ steps: number; aborted: string | null }> => {
      const ok = await waitUntil(
        startedMs + (index + 1) * everyMs + STEP_GRACE_MS
      );
      if (!ok) return { steps: Math.max(index, 1), aborted: unresponsive };
      await pullWorkers(rawDir, false);
      const evaluation = await evaluateCapacityStep({
        fs: deps.fs,
        rawDir,
        benchmark,
        index,
        startMs: startedMs,
        priorBreaks,
        lastStep: index + 1 >= total
      });
      await deps.log(evaluation.line);
      if (evaluation.point) deps.live?.point(benchmark.id, evaluation.point);
      if (evaluation.stop || index + 1 >= total) {
        return { steps: index + 1, aborted: null };
      }
      return runStep(index + 1, evaluation.broken ? priorBreaks + 1 : 0);
    };
    return runStep(0, 0);
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

  /** The cluster sampler's file as the UUT's sampler lines. */
  async function convertKubeSamples(rawDir: string) {
    const file = `${rawDir}/kube-uut.jsonl`;
    const text = (await deps.fs.exists(file))
      ? await deps.fs.readFile(file)
      : "";
    await deps.fs.writeFile(
      `${rawDir}/sampler-uut.jsonl`,
      toKubeSamplerLines(text)
    );
  }

  async function mergeHostFiles(rawDir: string) {
    const read = async (file: string) =>
      (await deps.fs.exists(`${rawDir}/${file}`))
        ? deps.fs.readFile(`${rawDir}/${file}`)
        : "";
    const merge = async (kind: "sampler" | "udp") => {
      const parts = await Promise.all(
        ["uut", "loadgen", ...workerHosts].map((host) =>
          read(`${kind}-${host}.jsonl`)
        )
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
    registerUsers: number,
    rate: BenchmarkRate | undefined
  ) {
    const tool = `SIPp ${state.tools.sipp.replace(/-.*$/, "")}, ${benchmark.load.transport.toUpperCase()}${benchmark.telemetry.otlp ? "; OpenTelemetry" : ""}`;
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
            }),
            registerUsers
          }
        : {
            ...base,
            kind: "soak",
            load: {
              cps:
                rate?.cps ??
                ("cps" in benchmark.load.rate ? benchmark.load.rate.cps : 0),
              holdS: durationToSeconds(benchmark.load.hold),
              ...(rate ? { rateSource: rate.rateSource } : {})
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
