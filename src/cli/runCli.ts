/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { Command, CommanderError } from "commander";
import { createRenderSite } from "../render/createRenderSite.js";
import { createSummarizeReport } from "../summary/createSummarizeReport.js";
import { createValidateFile } from "../validate/createValidateFile.js";
import {
  DEFAULT_COLLECT_TIMEOUT,
  REMOTE_ROOT
} from "../orchestrate/constants.js";
import { runCollectCommand } from "./runCollectCommand.js";
import { runRunCommand } from "./runRunCommand.js";
import { runSweepCommand } from "./runSweepCommand.js";
import { type CliDeps, EXIT_BAD_INPUT, EXIT_INFRA } from "./types.js";

export type { CliDeps, InfraCliDeps } from "./types.js";

export const EXIT_VALID = 0;
export const EXIT_USAGE = 1;
export const EXIT_INVALID = 2;
export const EXIT_FETCH = 3;

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
  130  cancelled; everything deleted, a report if a benchmark finished`;

const RUN_HELP = `
This creates two billable dedicated-CPU DigitalOcean droplets (the sizes in
perfkit.yaml) and deletes them at the end, on every exit path. If a run is
killed before it can delete them, perfkit sweep deletes them later.

With --local it creates nothing on DigitalOcean: the server under test and
the load generator run on this machine's Docker, with host networking, and
the run needs no token. With --detach it returns once the agent on the load
generator has started; perfkit collect <run id> finishes it.

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

const COLLECT_HELP = `
Follows a run started with --detach: prints its progress and downloads each
benchmark's raw results into <out>/<run id>/raw/ as soon as it is done. It
finds the droplets by the tag perfkit-run-<run id> and first adds this
machine's public IP to the run's firewall. Once the run is done it writes
<out>/<run id>/report.json and deletes everything; with --wait it only
waits and never deletes.

Environment:
  DIGITALOCEAN_TOKEN  required, except for a --local run.
  PERFKIT_SSH_KEY     the key the run was started with, unless this machine
                      started it (its key is in ~/.perfkit/runs/<run id>/).

Exit codes:
  0    the run is done (with --wait), or every benchmark passed
  1    report written, at least one benchmark not passed
  2    bad flags, a missing token or no SSH key for the run
  3    the agent failed (the unfinished benchmarks' raw results are still
       downloaded), or no benchmark produced results
  4    the timeout passed while the run goes on; nothing deleted
  130  cancelled; with --wait nothing deleted, otherwise everything`;
const RENDER_HELP = `
Writes to --out:
  index.html                  the shell of the latest run
  runs/<id>/index.html        a shell per run in the history
  runs/<id>/report.json       this run's report, for the page's link
  data/runs.json              the history, newest first, with this run in it
  data/runs/<id>/report.json  this run's report, which the app draws
  app/<version>/app.js        this perfkit's app, which draws every page

The pages are drawn in the browser from data/, so older reports are never
read or rewritten, and publishing with a newer perfkit redraws every run.

Exit codes:
  0  the site was written
  1  usage error
  2  the report or the history is invalid, unreadable or of another schema
  3  the history URL could not be fetched (a 404 means no history)`;

const SERVE_HELP = `
A read-only static server for the directory perfkit render wrote, as GitHub
Pages serves it, with nothing cached. To watch a run on this machine live:

  perfkit serve --site out/benchmarks --port 8080
  perfkit run --local --config perf/perfkit.yaml --target-version <tag>
  open "http://localhost:8080/?live=http://localhost:8787/live.json"

Exit codes:
  0  stopped with Ctrl-C
  1  usage error
  2  the site could not be served (the port is taken)`;

const SUMMARY_HELP = `
Prints the report as GitHub Markdown, for a workflow's run summary:
  perfkit summary --report .perfkit/<run id>/report.json >> "$GITHUB_STEP_SUMMARY"

Exit codes:
  0  the summary was printed
  1  usage error
  2  the report is invalid, unreadable or of another schema`;

/**
 * Runs the perfkit CLI with the given argv (as in process.argv) and returns
 * the exit code. Output goes through `deps.stdout` and `deps.stderr`.
 */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const validateFile = createValidateFile(deps);
  const renderSite = createRenderSite(deps);
  const summarizeReport = createSummarizeReport(deps);
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
      // run and sweep exit 2 on a usage error; validate and render exit 1.
      if (["run", "sweep", "collect"].includes(subcommand.name())) {
        usageExitCode = EXIT_BAD_INPUT;
      }
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
    .option(
      "--local",
      "run on this machine's Docker instead of DigitalOcean; needs no token",
      false
    )
    .option(
      "--live-port <port>",
      "the port live.json is served on (default: live.port of perfkit.yaml, else 8787)"
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
        local: boolean;
        livePort?: string;
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

  program
    .command("collect")
    .description(
      "Follow a detached run, download its results, write report.json and delete everything."
    )
    .argument("<run-id>", "the run id that run --detach printed")
    .option("--wait", "only wait for the run to end; never delete", false)
    .option("--out <dir>", "where the run's files go", ".perfkit")
    .option(
      "--timeout <duration>",
      "give up waiting after this, like 5h50m or 90m (exit 4)",
      DEFAULT_COLLECT_TIMEOUT
    )
    .addHelpText("after", COLLECT_HELP)
    .action(
      async (
        runId: string,
        options: { wait: boolean; out: string; timeout: string }
      ) => {
        exitCode = await runCollectCommand({ runId, ...options }, deps);
      }
    );

  program
    .command("agent", { hidden: true })
    .description("Drive a run's load on its load generator (internal).")
    .requiredOption("--run <run-id>", "the run id")
    .option("--root <dir>", "the run's root", REMOTE_ROOT)
    .action(async (options: { run: string; root: string }) => {
      const outcome = await deps.infra.runAgent({
        root: options.root,
        runId: options.run
      });
      exitCode = outcome.status === "done" ? EXIT_VALID : EXIT_INFRA;
    });

  program
    .command("render")
    .description(
      "Add a report.json to the benchmarks site: its data, the page shells and the app that draws them."
    )
    .requiredOption("--report <file>", "the run's report.json")
    .option(
      "--history <file|url>",
      "the published data/runs.json (or a runs.json of the old layout), as a file or an https URL; without it, this is the first run"
    )
    .requiredOption("--out <dir>", "the directory to write the site into")
    .addHelpText("after", RENDER_HELP)
    .action(
      async (options: { report: string; history?: string; out: string }) => {
        const result = await renderSite(options);
        if (!result.ok) {
          result.errors.forEach((line) => deps.stderr(`${line}\n`));
          exitCode = result.exitCode;
          return;
        }
        result.warnings.forEach((line) => deps.stderr(`${line}\n`));
        result.written.forEach(({ path, note }) => {
          deps.stdout(`wrote ${path}${note ? ` (${note})` : ""}\n`);
        });
        exitCode = EXIT_VALID;
      }
    );

  program
    .command("serve")
    .description(
      "Serve a rendered benchmarks site on this machine, to preview it or watch a --local run live."
    )
    .requiredOption("--site <dir>", "the site directory perfkit render wrote")
    .option("--port <port>", "the port to listen on", "8080")
    .option("--host <address>", "the address to listen on", "127.0.0.1")
    .addHelpText("after", SERVE_HELP)
    .action(async (options: { site: string; port: string; host: string }) => {
      const port = Number(options.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        deps.stderr("perfkit: --port: expected a port from 0 to 65535\n");
        exitCode = EXIT_USAGE;
        return;
      }
      if (!deps.serveSite) {
        deps.stderr("perfkit: serve is not available here\n");
        exitCode = EXIT_INVALID;
        return;
      }
      const served = await deps
        .serveSite({ site: options.site, port, host: options.host })
        .catch((err: unknown) => err as Error);
      if (served instanceof Error) {
        deps.stderr(
          `perfkit: cannot serve ${options.site}: ${served.message}\n`
        );
        exitCode = EXIT_INVALID;
        return;
      }
      deps.stdout(
        `serving ${options.site} at http://${options.host}:${served.port}/ (Ctrl-C stops)\n`
      );
      await served.stopped;
      exitCode = EXIT_VALID;
    });

  program
    .command("summary")
    .description(
      "Print a report.json as Markdown, for a GitHub workflow's run summary."
    )
    .requiredOption("--report <file>", "the run's report.json")
    .addHelpText("after", SUMMARY_HELP)
    .action(async (options: { report: string }) => {
      const result = await summarizeReport(options);
      if (!result.ok) {
        result.errors.forEach((line) => deps.stderr(`${line}\n`));
        exitCode = EXIT_INVALID;
        return;
      }
      deps.stdout(result.markdown);
      exitCode = EXIT_VALID;
    });

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
