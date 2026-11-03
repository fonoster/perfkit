/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { Command, CommanderError } from "commander";
import { createRenderSite } from "../render/createRenderSite.js";
import type { RenderSiteDeps } from "../render/types.js";
import { createValidateFile } from "../validate/createValidateFile.js";

export const EXIT_VALID = 0;
export const EXIT_USAGE = 1;
export const EXIT_INVALID = 2;
export const EXIT_FETCH = 3;

export interface CliDeps extends RenderSiteDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const FORMATS_HELP = `
Formats, told apart by apiVersion or schema:
  perfkit/v1         perf/perfkit.yaml, a project's benchmark definitions
  perfkit/report/v1  report.json, the results of one run
  perfkit/runs/v1    runs.json, the history index of a project's runs

Exit codes:
  0  the file is valid
  1  usage error
  2  the file is invalid, unreadable or of an unknown schema`;

const RENDER_HELP = `
Writes to --out:
  index.html             the latest run (only when this run is the newest)
  runs/<id>/index.html   this run's page; older run pages are never rewritten
  runs/<id>/report.json  this run's report
  runs.json              the history, newest first, with this run in it

Exit codes:
  0  the site was written
  1  usage error
  2  the report or the history is invalid, unreadable or of another schema
  3  the history URL could not be fetched (a 404 means no history)`;

/**
 * Runs the perfkit CLI with the given argv (as in process.argv) and returns
 * the exit code. Output goes through `deps.stdout` and `deps.stderr`.
 */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const validateFile = createValidateFile(deps);
  const renderSite = createRenderSite(deps);
  let exitCode = EXIT_VALID;

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
    .addHelpText("after", FORMATS_HELP);

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
    .command("render")
    .description(
      "Render a report.json into the benchmarks site: the run's page, the latest page and runs.json."
    )
    .requiredOption("--report <file>", "the run's report.json")
    .option(
      "--history <file|url>",
      "the published runs.json, as a file or an https URL; without it, this is the first run"
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

  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode === 0 ? EXIT_VALID : EXIT_USAGE;
    }
    throw err;
  }
}
