/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { fileValidationError } from "./fileValidationError.js";

/**
 * Parses a JSON file, like meta.json, and validates it against its schema.
 * Throws an Error when the text is not JSON and a ValidationError when it
 * does not match.
 */
export function parseJsonDocument<TSchema extends z.ZodType>(
  text: string,
  file: string,
  schema: TSchema
): z.infer<TSchema> {
  const value = parseJson(text, file);
  const result = schema.safeParse(value, { reportInput: true });
  if (!result.success) throw fileValidationError(file, result.error);
  return result.data;
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${file}: not JSON: ${message}`);
  }
}
