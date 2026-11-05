/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/withErrorHandlingAndValidation.js";
import { reportSchema, SCHEMA_IDS } from "../schemas/index.js";
import { createValidateFile } from "../validate/createValidateFile.js";
import { parseDocument } from "../validate/parseDocument.js";
import type { ValidateFileDeps } from "../validate/types.js";
import { formatReportSummary } from "./formatReportSummary.js";
import {
  type SummarizeReportInput,
  summarizeReportInputSchema
} from "./summarizeReport.schema.js";

export type SummarizeReportResult =
  { ok: true; markdown: string } | { ok: false; errors: string[] };

/**
 * Creates the function behind `perfkit summary`: it validates a report.json
 * and returns it as GitHub Markdown, for $GITHUB_STEP_SUMMARY.
 *
 * @param deps - File system access (injected)
 * @returns A validated function that returns the Markdown, or the error
 *   lines when the file is not a valid report
 */
export function createSummarizeReport(deps: ValidateFileDeps) {
  const validateFile = createValidateFile(deps);

  const fn = async ({
    report: file
  }: SummarizeReportInput): Promise<SummarizeReportResult> => {
    const checked = await validateFile({ file });
    if (!checked.valid) {
      return {
        ok: false,
        errors: checked.errors.map(({ path, message }) =>
          path === null ? `${file}: ${message}` : `${file}: ${path}: ${message}`
        )
      };
    }
    if (checked.format !== SCHEMA_IDS.report) {
      return {
        ok: false,
        errors: [
          `${file}: expected a ${SCHEMA_IDS.report} report; got ${checked.format}`
        ]
      };
    }
    const report = reportSchema.parse(
      parseDocument(await deps.readFile(file), file)
    );
    return { ok: true, markdown: formatReportSummary(report) };
  };

  return withErrorHandlingAndValidation(fn, summarizeReportInputSchema);
}
