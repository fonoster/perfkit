/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { ValidationError } from "../errors/index.js";
import {
  createSweep,
  createTeardown,
  formatDeleteFailure,
  messageOf,
  type SweepResult
} from "../infra/index.js";
import { createLoadConfig } from "../validate/createLoadConfig.js";
import { formatSweep } from "./formatSweep.js";
import { type CliDeps, EXIT_BAD_INPUT, EXIT_INFRA, EXIT_OK } from "./types.js";

export interface SweepCommandOptions {
  config?: string;
  run?: string;
  olderThan?: string;
  dryRun: boolean;
}

const FLAG_OF: Record<string, string> = {
  olderThan: "--older-than",
  runId: "--run"
};

/**
 * `perfkit sweep`: delete what lost runs left behind. `--older-than`
 * defaults to `infra.maxLifetime` of `--config`, else 9h. Returns the exit
 * code: 0 when everything selected was deleted (or there was nothing), 2 for
 * bad flags or no token, 3 for an API error or a delete that failed.
 */
export async function runSweepCommand(
  options: SweepCommandOptions,
  deps: CliDeps
): Promise<number> {
  const { infra } = deps;
  const fail = (code: number, message: string) => {
    deps.stderr(`perfkit: ${message}\n`);
    return code;
  };

  let maxLifetime = "9h";
  if (options.config !== undefined) {
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
    maxLifetime = loaded.config.infra.maxLifetime;
  }

  const token = infra.env.DIGITALOCEAN_TOKEN;
  if (!token) return fail(EXIT_BAD_INPUT, "DIGITALOCEAN_TOKEN is not set");

  const client = infra.createDoClient(token);
  const sweep = createSweep({
    client,
    teardown: createTeardown({ client, sleep: infra.sleep, now: infra.now }),
    now: infra.now
  });

  let result: SweepResult;
  try {
    result = await sweep({
      olderThan: options.olderThan ?? maxLifetime,
      runId: options.run,
      dryRun: options.dryRun
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      err.fieldErrors.forEach(({ field, message }) =>
        deps.stderr(`perfkit: ${FLAG_OF[field] ?? field}: ${message}\n`)
      );
      return EXIT_BAD_INPUT;
    }
    return fail(EXIT_INFRA, `DigitalOcean API error: ${messageOf(err)}`);
  }

  deps.stdout(formatSweep(result));
  const failures = result.runs.flatMap(({ runId, failures }) =>
    failures.map((failure) => formatDeleteFailure(failure, runId))
  );
  failures.forEach((line) => deps.stderr(`perfkit: ${line}\n`));
  return failures.length > 0 ? EXIT_INFRA : EXIT_OK;
}
