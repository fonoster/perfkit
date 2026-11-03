/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { dirname, resolve } from "node:path";
import { toFieldErrors } from "../errors/toFieldErrors.js";
import { withErrorHandlingAndValidation } from "../errors/withErrorHandlingAndValidation.js";
import {
  perfkitConfigSchema,
  reportSchema,
  runsSchema,
  SCHEMA_IDS
} from "../schemas/index.js";
import { checkConfigPaths } from "./checkConfigPaths.js";
import { detectFormat } from "./detectFormat.js";
import { parseDocument } from "./parseDocument.js";
import type { ValidateFileDeps, ValidateFileResult } from "./types.js";
import {
  type ValidateFileInput,
  validateFileInputSchema
} from "./validateFile.schema.js";

/**
 * Creates the function behind `perfkit validate`: it reads one file, tells
 * the format apart, and checks it against that format's schema. For a
 * perfkit.yaml it also checks that every path it names exists.
 *
 * @param deps - File system access (injected)
 * @returns A validated function that returns the file's errors, if any
 */
export function createValidateFile(deps: ValidateFileDeps) {
  const fn = async ({
    file
  }: ValidateFileInput): Promise<ValidateFileResult> => {
    const failed = (message: string): ValidateFileResult => ({
      valid: false,
      format: null,
      errors: [{ path: null, message }]
    });

    const text = await deps
      .readFile(file)
      .catch((err: unknown) => err as Error);
    if (text instanceof Error) {
      return failed(`cannot read: ${reasonOf(text)}`);
    }

    const parsed = safely(() => parseDocument(text, file));
    if (!parsed.ok) return failed(`cannot parse: ${parsed.reason}`);

    const detected = detectFormat(parsed.value);
    if (!detected.ok) return failed(detected.message);
    const format = detected.format;

    if (format === SCHEMA_IDS.config) {
      const result = perfkitConfigSchema.safeParse(parsed.value, {
        reportInput: true
      });
      if (!result.success) {
        return {
          valid: false,
          format,
          errors: toDocumentErrors(result.error.issues)
        };
      }
      const missing = await checkConfigPaths(
        result.data,
        dirname(resolve(file)),
        deps.isFile
      );
      if (missing.length > 0) return { valid: false, format, errors: missing };
      return {
        valid: true,
        format,
        summary: `valid ${format} config, ${plural(result.data.benchmarks.length, "benchmark")}`
      };
    }

    if (format === SCHEMA_IDS.report) {
      const result = reportSchema.safeParse(parsed.value, {
        reportInput: true
      });
      if (!result.success) {
        return {
          valid: false,
          format,
          errors: toDocumentErrors(result.error.issues)
        };
      }
      return {
        valid: true,
        format,
        summary: `valid ${format} report, ${plural(result.data.benchmarks.length, "benchmark")}`
      };
    }

    const result = runsSchema.safeParse(parsed.value, { reportInput: true });
    if (!result.success) {
      return {
        valid: false,
        format,
        errors: toDocumentErrors(result.error.issues)
      };
    }
    return {
      valid: true,
      format,
      summary: `valid ${format} index, ${plural(result.data.runs.length, "run")}`
    };
  };

  return withErrorHandlingAndValidation(fn, validateFileInputSchema);
}

function toDocumentErrors(issues: Parameters<typeof toFieldErrors>[0]) {
  return toFieldErrors(issues).map(({ field, message }) => ({
    path: field,
    message
  }));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function reasonOf(err: Error): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return "no such file";
  if (code === "EISDIR") return "is a directory";
  if (code === "EACCES") return "permission denied";
  return err.message.split("\n")[0] ?? String(err);
}

function safely<T>(
  read: () => T
): { ok: true; value: T } | { ok: false; reason: string } {
  try {
    return { ok: true, value: read() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message.split("\n")[0] ?? message };
  }
}
