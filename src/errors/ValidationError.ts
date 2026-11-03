/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { type FieldError, toFieldErrors } from "./toFieldErrors.js";

export type { FieldError };

/**
 * Wraps a Zod error with field-level details. `fieldErrors` holds one entry
 * per field, with its JSON path (`benchmarks[1].verdict`) and a message in
 * the same words `perfkit validate` prints.
 */
export class ValidationError extends Error {
  public readonly code = "VALIDATION_ERROR";
  public readonly fieldErrors: FieldError[];
  public readonly zodError: z.ZodError;

  constructor(zodError: z.ZodError) {
    const fieldErrors = toFieldErrors(zodError.issues);
    super(
      fieldErrors.length === 0
        ? "Validation failed"
        : fieldErrors.map((e) => `${e.field}: ${e.message}`).join("; ")
    );
    this.name = "ValidationError";
    this.zodError = zodError;
    this.fieldErrors = fieldErrors;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}
