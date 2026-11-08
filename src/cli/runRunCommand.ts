/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { LIVE_DEFAULT_PORT } from "../live/constants.js";
import type { LiveSettings } from "../orchestrate/runState.schema.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ValidationError } from "../errors/index.js";
import {
  createPlanRun,
  createProvision,
  createResolveImageDigests,
  createTeardown,
  createWithRun,
  formatDeleteFailure,
  ImageNotFoundError,
  LookupError,
  messageOf,
  type Plan,
  type RunOutcome,
  type SshIdentity
} from "../infra/index.js";
import { buildHelmEnv } from "../orchestrate/buildHelmEnv.js";
import { createLocalRemote } from "../orchestrate/createLocalRemote.js";
import { renderHelmValues } from "../orchestrate/renderHelmValues.js";
import type { RunClusterState } from "../orchestrate/runState.schema.js";
import { createStartRun } from "../orchestrate/createStartRun.js";
import type { PerfkitConfig } from "../schemas/index.js";
import { createLoadConfig } from "../validate/createLoadConfig.js";
import { checkComposeFiles } from "./checkComposeFiles.js";
import { createKindCluster } from "./createKindCluster.js";
import { createStartExecutor } from "./createStartExecutor.js";
import { localTeardown } from "./localTeardown.js";
import { runCollectCommand } from "./runCollectCommand.js";
import { homeRunDir } from "./runState.js";
import { formatPlan } from "./formatPlan.js";
import {
  type CliDeps,
  EXIT_BAD_INPUT,
  EXIT_CANCELLED,
  EXIT_INFRA,
  EXIT_NOT_PASSED,
  EXIT_OK
} from "./types.js";

export interface RunCommandOptions {
  config: string;
  targetVersion: string;
  commit?: string;
  benchmarks?: string;
  out: string;
  detach: boolean;
  dryRun: boolean;
  local?: boolean;
  /** --live-port; default live.port of perfkit.yaml, else 8787. */
  livePort?: string;
}

const FLAG_OF: Record<string, string> = {
  targetVersion: "--target-version",
  commit: "--commit",
  benchmarks: "--benchmarks"
};

/**
 * `perfkit run`: load the config, plan the run, and either print the plan
 * (`--dry-run`, no token, nothing created) or provision the run, execute the
 * benchmarks and tear down. Returns the exit code.
 */
export async function runRunCommand(
  options: RunCommandOptions,
  deps: CliDeps
): Promise<number> {
  const { infra } = deps;
  const fail = (code: number, message: string) => {
    deps.stderr(`perfkit: ${message}\n`);
    return code;
  };

  const loaded = await createLoadConfig(deps)({ file: options.config });
  if (!loaded.ok) {
    loaded.errors.forEach(({ path, message }) =>
      deps.stderr(
        path === null
          ? `perfkit: ${options.config}: ${message}\n`
          : `perfkit: ${options.config}: ${path}: ${message}\n`
      )
    );
    return EXIT_BAD_INPUT;
  }

  const selected = options.benchmarks
    ?.split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  const composeErrors = await checkComposeFiles(
    loaded.config,
    options.config,
    selected,
    deps.readFile
  );
  if (composeErrors.length > 0) {
    composeErrors.forEach((line) => deps.stderr(`perfkit: ${line}\n`));
    return EXIT_BAD_INPUT;
  }
  const local = options.local === true;
  const livePort =
    options.livePort === undefined ? null : Number(options.livePort);
  if (
    livePort !== null &&
    !(Number.isInteger(livePort) && livePort >= 1 && livePort <= 65535)
  ) {
    return fail(EXIT_BAD_INPUT, "--live-port: expected a port from 1 to 65535");
  }
  const live = {
    port: livePort ?? loaded.config.live?.port ?? LIVE_DEFAULT_PORT,
    domain: loaded.config.live?.domain ?? (infra.env.NGROK_DOMAIN || null)
  };

  const commit =
    options.commit ?? (await infra.gitHead(dirname(resolve(options.config))));
  if (commit === null) {
    return fail(EXIT_BAD_INPUT, "--commit is required outside a git checkout");
  }

  const token = infra.env.DIGITALOCEAN_TOKEN;
  if (!local && !options.dryRun && !token) {
    return fail(
      EXIT_BAD_INPUT,
      "DIGITALOCEAN_TOKEN is not set; nothing was created"
    );
  }

  let sharedIdentity: SshIdentity | undefined;
  const sharedKey = infra.env.PERFKIT_SSH_KEY;
  if (!local && !options.dryRun && sharedKey) {
    const publicKey = await infra.ssh.publicKeyOf(sharedKey).catch(() => null);
    if (publicKey === null || !publicKey.startsWith("ssh-ed25519 ")) {
      return fail(
        EXIT_BAD_INPUT,
        "PERFKIT_SSH_KEY is not an ed25519 private key in OpenSSH format without a passphrase; nothing was created"
      );
    }
    sharedIdentity = { privateKey: sharedKey, publicKey };
  }

  const planRun = createPlanRun({
    resolveImageDigests: createResolveImageDigests({
      registry: infra.registry
    }),
    getPublicIp: local ? async () => "127.0.0.1" : infra.getPublicIp
  });
  let plan: Plan;
  try {
    plan = await planRun({
      config: loaded.config,
      targetVersion: options.targetVersion,
      commit,
      startedAt: new Date(infra.now()).toISOString().replace(/\.\d{3}Z$/, "Z"),
      benchmarks: selected
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      err.fieldErrors.forEach(({ field, message }) => {
        const flag = FLAG_OF[field.replace(/[[.].*$/, "")] ?? field;
        deps.stderr(`perfkit: ${flag}: ${message}\n`);
      });
      return EXIT_BAD_INPUT;
    }
    if (err instanceof ImageNotFoundError) {
      return fail(EXIT_BAD_INPUT, `${err.message}; nothing was created`);
    }
    if (err instanceof LookupError) {
      return fail(EXIT_INFRA, `${err.message}; nothing was created`);
    }
    throw err;
  }

  deps.stdout(formatPlan(plan, { dryRun: options.dryRun, local }));
  if (options.dryRun) return EXIT_OK;
  const command = describeCommand(options);
  if (local) {
    return runLocal(
      { plan, config: loaded.config, command, options, live },
      deps
    );
  }
  const agentKey = await infra.ssh.generateKeyPair();

  const client = infra.createDoClient(token!);
  const teardown = createTeardown({
    client,
    sleep: infra.sleep,
    now: infra.now
  });
  const withRun = createWithRun({
    provision: createProvision({
      client,
      ssh: infra.ssh,
      sleep: infra.sleep,
      now: infra.now,
      sharedIdentity
    }),
    teardown,
    signals: infra.signals
  });
  const execute = infra.executeBenchmarks ?? createStartExecutor(deps);
  const outcome = await withRun(
    plan,
    (ctx) =>
      execute(ctx, {
        out: options.out,
        detach: options.detach,
        configPath: options.config,
        config: loaded.config,
        command,
        agentKey: agentKey.privateKey,
        live
      }),
    { authorizedKeys: [agentKey.publicKey] }
  );
  if (outcome.status === "completed" && outcome.handedOff) {
    if (options.detach) {
      deps.stdout(
        `run ${plan.runId} started; collect it with: perfkit collect ${plan.runId}\n`
      );
      return EXIT_OK;
    }
    return runCollectCommand(
      { runId: plan.runId, wait: false, out: options.out, timeout: null },
      deps
    );
  }
  return report(outcome, plan, deps);
}

/** `perfkit run ...` as given, for report.json. */
function describeCommand(options: RunCommandOptions): string {
  return [
    "perfkit run",
    `--config ${options.config}`,
    `--target-version ${options.targetVersion}`,
    ...(options.commit ? [`--commit ${options.commit}`] : []),
    ...(options.benchmarks ? [`--benchmarks ${options.benchmarks}`] : []),
    ...(options.local ? ["--local"] : []),
    ...(options.detach ? ["--detach"] : [])
  ].join(" ");
}

/**
 * `run --local`: the same run on this machine's Docker, with no droplets,
 * no token and no SSH; its root is `~/.perfkit/runs/<id>/root`. A helm
 * benchmark runs on a kind cluster, `perfkit-<run id>`, with MetalLB for
 * its load balancers; it is deleted with the run's containers.
 */
async function runLocal(
  input: {
    plan: Plan;
    config: PerfkitConfig;
    command: string;
    options: RunCommandOptions;
    live: LiveSettings;
  },
  deps: CliDeps
): Promise<number> {
  const { plan, config, options } = input;
  const { infra } = deps;
  const dirs = homeRunDir(infra.home, plan.runId);
  await mkdir(dirs.root, { recursive: true });
  await writeFile(
    dirs.local,
    `${JSON.stringify({ mode: "local", root: dirs.root })}\n`
  );
  const logo = config.project.logo
    ? (
        await deps.readFile(join(dirname(options.config), config.project.logo))
      ).trim()
    : undefined;
  const favicon = config.project.favicon
    ? (
        await deps.readFile(
          join(dirname(options.config), config.project.favicon)
        )
      ).trim()
    : undefined;
  const projectDir = dirname(resolve(options.config));
  let cluster: { state: RunClusterState; kubeconfig: string } | undefined;
  try {
    if (plan.cluster) {
      const charts = await Promise.all(
        plan.benchmarks.flatMap((benchmark) =>
          "helm" in benchmark.uut
            ? [
                (async () => {
                  const helm = (
                    benchmark.uut as { helm: { chart: string; values: string } }
                  ).helm;
                  const values = join(dirs.dir, `values-${benchmark.id}.yaml`);
                  await writeFile(
                    values,
                    renderHelmValues(
                      await deps.readFile(join(projectDir, helm.values)),
                      buildHelmEnv({ plan }, null),
                      helm.values
                    )
                  );
                  return { chart: resolve(projectDir, helm.chart), values };
                })()
              ]
            : []
        )
      );
      deps.stdout(`creating the kind cluster ${plan.cluster.name}\n`);
      const kind = await createKindCluster({
        run: infra.runProgram,
        writeFile: (path, text) => writeFile(path, text, { mode: 0o600 })
      })({
        name: plan.cluster.name,
        runId: plan.runId,
        dir: dirs.dir,
        charts,
        images: plan.images.map(({ name, tag }) => `${name}:${tag}`)
      });
      kind.loaded.forEach((image) =>
        deps.stdout(`loaded ${image} into ${plan.cluster!.name}\n`)
      );
      cluster = {
        kubeconfig: kind.kubeconfig,
        state: {
          provider: "kind",
          name: plan.cluster.name,
          size: "local",
          nodes: 1,
          version: kind.version,
          network: "kind",
          sippIps: kind.sippIps,
          fixedIps: true
        }
      };
    }
    await createStartRun({
      remote: createLocalRemote({ run: infra.runProgram }),
      packageRoot: infra.packageRoot
    })({
      runId: plan.runId,
      mode: "local",
      root: dirs.root,
      namePrefix: infra.namePrefix,
      perfkitVersion: deps.version,
      command: input.command,
      plan,
      config,
      ...(logo ? { logoSvg: logo } : {}),
      ...(favicon ? { faviconSvg: favicon } : {}),
      hosts: {
        uutIp: "127.0.0.1",
        loadgenIp: "127.0.0.1",
        vpcCidr: "127.0.0.0/8"
      },
      projectDir,
      out: options.out,
      live: input.live,
      ...(cluster
        ? { cluster: cluster.state, kubeconfig: cluster.kubeconfig }
        : {})
    });
  } catch (err) {
    deps.stderr(`perfkit: ${messageOf(err)}\n`);
    await localTeardown(plan.runId, config, infra).catch(() => undefined);
    return EXIT_INFRA;
  }
  if (options.detach) {
    deps.stdout(
      `run ${plan.runId} started; collect it with: perfkit collect ${plan.runId}\n`
    );
    return EXIT_OK;
  }
  return runCollectCommand(
    { runId: plan.runId, wait: false, out: options.out, timeout: null },
    deps
  );
}

function report(
  outcome: RunOutcome<{ passed: boolean }>,
  plan: Plan,
  deps: CliDeps
): number {
  const { failures } = outcome.teardown;
  const allDeleted = failures.length === 0;
  const tail = allDeleted
    ? "Everything this run created was deleted."
    : "Not everything this run created was deleted:";
  const printFailures = () =>
    failures.forEach((failure) =>
      deps.stderr(`perfkit: ${formatDeleteFailure(failure, plan.runId)}\n`)
    );

  if (outcome.status === "cancelled") {
    deps.stderr(`perfkit: cancelled by ${outcome.signal}. ${tail}\n`);
    printFailures();
    return allDeleted ? EXIT_CANCELLED : EXIT_INFRA;
  }
  if (outcome.status === "failed") {
    deps.stderr(
      outcome.handedOff
        ? `perfkit: ${messageOf(outcome.error)}. The run was handed off and keeps its droplets; perfkit sweep --run ${plan.runId} deletes them.\n`
        : `perfkit: ${messageOf(outcome.error)}. ${tail}\n`
    );
    printFailures();
    return EXIT_INFRA;
  }
  if (!allDeleted) {
    printFailures();
    return EXIT_INFRA;
  }
  return outcome.value.passed ? EXIT_OK : EXIT_NOT_PASSED;
}
