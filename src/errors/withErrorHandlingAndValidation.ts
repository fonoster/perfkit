/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { ValidationError } from "./ValidationError.js";

/**
 * Validates a function's input against its schema before the function runs.
 * Invalid input throws a ValidationError and the function never runs.
 */
export function withErrorHandlingAndValidation<
  TSchema extends z.ZodType,
  TResult
>(
  fn: (params: z.infer<TSchema>) => Promise<TResult>,
  schema: TSchema
): (params: unknown) => Promise<TResult> {
  return async (params: unknown) => {
    const result = schema.safeParse(params, { reportInput: true });
    if (!result.success) {
      throw new ValidationError(result.error);
    }
    return fn(result.data);
  };
}
