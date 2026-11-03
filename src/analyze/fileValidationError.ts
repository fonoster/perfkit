/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { ValidationError } from "../errors/index.js";

/**
 * A ValidationError for the contents of one raw results file: its message
 * starts with the file, like `meta.json: steps[0].from: required`.
 */
export function fileValidationError(
  file: string,
  zodError: z.ZodError
): ValidationError {
  const error = new ValidationError(zodError);
  error.message = `${file}: ${error.message}`;
  return error;
}
