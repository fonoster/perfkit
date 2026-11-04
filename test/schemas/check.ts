/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { toFieldErrors } from "../../src/errors/toFieldErrors.js";

/** Parses like `perfkit validate` and returns its error lines, path first. */
export function errorsOf(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value, { reportInput: true });
  return result.success
    ? []
    : toFieldErrors(result.error.issues).map((e) => `${e.field}: ${e.message}`);
}
