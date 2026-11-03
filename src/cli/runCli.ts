/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { Command, CommanderError } from "commander";
import { createValidateFile } from "../validate/createValidateFile.js";
import type { ValidateFileDeps } from "../validate/types.js";

export const EXIT_VALID = 0;
export const EXIT_USAGE = 1;
export const EXIT_INVALID = 2;

export interface CliDeps extends ValidateFileDeps {
  version: string;
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

/**
 * Runs the perfkit CLI with the given argv (as in process.argv) and returns
 * the exit code. Output goes through `deps.stdout` and `deps.stderr`.
 */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const validateFile = createValidateFile(deps);
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
