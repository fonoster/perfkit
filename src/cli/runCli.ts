/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { Command, CommanderError } from "commander";
import { createValidateFile } from "../validate/createValidateFile.js";
import { runRunCommand } from "./runRunCommand.js";
import { runSweepCommand } from "./runSweepCommand.js";
import { type CliDeps, EXIT_BAD_INPUT } from "./types.js";

export type { CliDeps, InfraCliDeps } from "./types.js";

export const EXIT_VALID = 0;
export const EXIT_USAGE = 1;
export const EXIT_INVALID = 2;

const FORMATS_HELP = `
Formats, told apart by apiVersion or schema:
  perfkit/v1         perf/perfkit.yaml, a project's benchmark definitions
  perfkit/report/v1  report.json, the results of one run
  perfkit/runs/v1    runs.json, the history index of a project's runs

Exit codes:
  0  the file is valid
  1  usage error
  2  the file is invalid, unreadable or of an unknown schema`;

const EXIT_CODES_HELP = `
Exit codes:
  0    ok, every benchmark passed
  1    report written, at least one benchmark not passed
  2    bad config, flags or a missing token; nothing created
  3    infrastructure error; everything this run created is deleted, no report
  130  cancelled; everything deleted`;

const RUN_HELP = `
This creates two billable dedicated-CPU DigitalOcean droplets (the sizes in
perfkit.yaml) and deletes them at the end, on every exit path. If a run is
killed before it can delete them, perfkit sweep deletes them later.

Environment:
  DIGITALOCEAN_TOKEN  required, except with --dry-run. Never printed, never
                      written to a file or a droplet.
  PERFKIT_SSH_KEY     optional ed25519 private key (OpenSSH format), reused
                      as the account key perfkit-shared and never deleted.
                      Without it, the run creates perfkit-<run id> for this
                      run only and deletes it at teardown.
${EXIT_CODES_HELP}`;

const SWEEP_HELP = `
Deletes only droplets tagged perfkit and named perfkit-<run id>-uut or
-loadgen, and the firewall, VPC and SSH key named perfkit-<run id> of those
runs. It never deletes the perfkit-shared SSH key.

Environment:
  DIGITALOCEAN_TOKEN  required. Never printed.

Exit codes:
  0  everything selected was deleted, or there was nothing to sweep
  2  bad flags or config, or a missing token
  3  a DigitalOcean API error, or a delete that failed`;

/**
 * Runs the perfkit CLI with the given argv (as in process.argv) and returns
 * the exit code. Output goes through `deps.stdout` and `deps.stderr`.
 */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const validateFile = createValidateFile(deps);
  let exitCode = EXIT_VALID;
  let usageExitCode = EXIT_USAGE;

  const program = new Command()
    .name("perfkit")
    .description(
      "Benchmarks for Fonoster projects, with one report format for all of them."
    )
    .version(deps.version, "-v, --version", "print the perfkit version")
    .helpOption("-h, --help", "show help")
    .exitOverride()
    .configureOutput({ writeOut: deps.stdout, writeErr: deps.stderr })
    .showHelpAfterError("(add --help for usage)")
    .addHelpText("after", FORMATS_HELP)
    .hook("preSubcommand", (_program, subcommand) => {
      if (subcommand.name() !== "validate") usageExitCode = EXIT_BAD_INPUT;
    });

  program
    .command("validate")
    .description("Check a perfkit.yaml, report.json or runs.json file.")
    .argument("<file>", "the file to check")
    .addHelpText("after", FORMATS_HELP)
    .action(async (file: string) => {
      const result = await validateFile({ file });
      if (result.valid) {
        deps.stdout(`${file}: ${result.summary}\n`);
        exitCode = EXIT_VALID;
        return;
      }
      result.errors.forEach(({ path, message }) => {
        deps.stderr(
          path === null
            ? `${file}: ${message}\n`
            : `${file}: ${path}: ${message}\n`
        );
      });
      exitCode = EXIT_INVALID;
    });

  program
    .command("run")
    .description(
      "Create the run's two droplets, run the benchmarks and delete the droplets at the end."
    )
    .requiredOption("--config <perfkit.yaml>", "the project's perfkit.yaml")
    .requiredOption(
      "--target-version <tag>",
      "the image tag under test, for every image in perfkit.yaml"
    )
    .option(
      "--commit <sha>",
      "the commit under test (default: git rev-parse HEAD in the directory of the config file)"
    )
    .option(
      "--benchmarks <id,id>",
      "run only these benchmarks (default: every benchmark in perfkit.yaml)"
    )
    .option("--out <dir>", "where the run writes its files", ".perfkit")
    .option(
      "--detach",
      "hand the run off to an agent on the droplets and exit",
      false
    )
    .option(
      "--dry-run",
      "print the plan and create nothing; needs no token",
      false
    )
    .addHelpText("after", RUN_HELP)
    .action(
      async (options: {
        config: string;
        targetVersion: string;
        commit?: string;
        benchmarks?: string;
        out: string;
        detach: boolean;
        dryRun: boolean;
      }) => {
        exitCode = await runRunCommand(options, deps);
      }
    );

  program
    .command("sweep")
    .description(
      "Delete the droplets, firewalls, VPCs and SSH keys that lost runs left behind."
    )
    .option(
      "--config <perfkit.yaml>",
      "read the default for --older-than from its infra.maxLifetime"
    )
    .option("--run <run-id>", "delete this run's resources, at any age")
    .option(
      "--older-than <duration>",
      "delete runs older than this, like 9h or 90m (default: infra.maxLifetime of --config, else 9h)"
    )
    .option("--dry-run", "list what would be deleted; delete nothing", false)
    .addHelpText("after", SWEEP_HELP)
    .action(
      async (options: {
        config?: string;
        run?: string;
        olderThan?: string;
        dryRun: boolean;
      }) => {
        exitCode = await runSweepCommand(options, deps);
      }
    );

  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode === 0 ? EXIT_VALID : usageExitCode;
    }
    throw err;
  }
}
