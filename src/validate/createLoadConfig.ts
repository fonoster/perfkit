/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/withErrorHandlingAndValidation.js";
import {
  perfkitConfigSchema,
  type PerfkitConfig,
  SCHEMA_IDS
} from "../schemas/index.js";
import { createValidateFile } from "./createValidateFile.js";
import { parseDocument } from "./parseDocument.js";
import type { DocumentError, ValidateFileDeps } from "./types.js";
import {
  type ValidateFileInput,
  validateFileInputSchema
} from "./validateFile.schema.js";

export type LoadConfigResult =
  { ok: true; config: PerfkitConfig } | { ok: false; errors: DocumentError[] };

/**
 * Creates the function that loads a perfkit.yaml for `run` and `sweep`: the
 * same checks as `perfkit validate`, and the file must be a perfkit.yaml.
 *
 * @param deps - File system access (injected)
 * @returns A validated function that returns the config with its defaults
 */
export function createLoadConfig(deps: ValidateFileDeps) {
  const validateFile = createValidateFile(deps);

  const fn = async ({ file }: ValidateFileInput): Promise<LoadConfigResult> => {
    const result = await validateFile({ file });
    if (!result.valid) return { ok: false, errors: result.errors };
    if (result.format !== SCHEMA_IDS.config) {
      return {
        ok: false,
        errors: [
          {
            path: null,
            message: `expected a perfkit.yaml (apiVersion: ${SCHEMA_IDS.config}); got a ${result.format} file`
          }
        ]
      };
    }
    const text = await deps.readFile(file);
    return {
      ok: true,
      config: perfkitConfigSchema.parse(parseDocument(text, file))
    };
  };

  return withErrorHandlingAndValidation(fn, validateFileInputSchema);
}
