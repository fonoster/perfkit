/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
export { checkConfigPaths } from "./checkConfigPaths.js";
export { createValidateFile } from "./createValidateFile.js";
export { type DetectedFormat, detectFormat } from "./detectFormat.js";
export { parseDocument } from "./parseDocument.js";
export type {
  DocumentError,
  ValidateFileDeps,
  ValidateFileResult
} from "./types.js";
export {
  type ValidateFileInput,
  validateFileInputSchema
} from "./validateFile.schema.js";
