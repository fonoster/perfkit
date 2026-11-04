/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { fileValidationError } from "./fileValidationError.js";

/**
 * Parses a JSON Lines file, like sampler.jsonl, and validates every line
 * against the line schema. Blank lines are skipped. An error names the line
 * by its 0-based index among the non-blank lines: `sampler.jsonl: [3].pid`.
 */
export function parseJsonLines<TSchema extends z.ZodType>(
  text: string,
  file: string,
  lineSchema: TSchema
): Array<z.infer<TSchema>> {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const values = lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new Error(`${file}: line ${index + 1} is not JSON`);
    }
  });
  const result = z.array(lineSchema).safeParse(values, { reportInput: true });
  if (!result.success) throw fileValidationError(file, result.error);
  return result.data;
}
