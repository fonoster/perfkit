/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { dirname, resolve } from "node:path";
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
import { createLoadConfig } from "../validate/createLoadConfig.js";
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

  const commit =
    options.commit ?? (await infra.gitHead(dirname(resolve(options.config))));
  if (commit === null) {
    return fail(EXIT_BAD_INPUT, "--commit is required outside a git checkout");
  }

  const token = infra.env.DIGITALOCEAN_TOKEN;
  if (!options.dryRun && !token) {
    return fail(
      EXIT_BAD_INPUT,
      "DIGITALOCEAN_TOKEN is not set; nothing was created"
    );
  }

  let sharedIdentity: SshIdentity | undefined;
  const sharedKey = infra.env.PERFKIT_SSH_KEY;
  if (!options.dryRun && sharedKey) {
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
    getPublicIp: infra.getPublicIp
  });
  let plan: Plan;
  try {
    plan = await planRun({
      config: loaded.config,
      targetVersion: options.targetVersion,
      commit,
      startedAt: new Date(infra.now()).toISOString().replace(/\.\d{3}Z$/, "Z"),
      benchmarks: options.benchmarks
        ?.split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "")
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

  deps.stdout(formatPlan(plan, { dryRun: options.dryRun }));
  if (options.dryRun) return EXIT_OK;

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
  const outcome = await withRun(plan, (ctx) =>
    infra.executeBenchmarks(ctx, {
      out: options.out,
      detach: options.detach
    })
  );
  return report(outcome, plan, deps);
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
