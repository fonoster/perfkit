/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { formatIssueMessage } from "./formatIssueMessage.js";
import { formatPath } from "./formatPath.js";

export interface FieldError {
  /** JSON path of the field, like `benchmarks[1].verdict`. */
  field: string;
  message: string;
  code: string;
}

/**
 * Flattens Zod issues into one error per field, sorted by path (array indexes
 * in numeric order) so the output is stable. An unknown-keys issue becomes one
 * error per key, at the key's own path.
 */
export function toFieldErrors(issues: ReadonlyArray<z.core.$ZodIssue>) {
  const flat = issues.flatMap<{
    issue: z.core.$ZodIssue;
    path: PropertyKey[];
  }>((issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => ({ issue, path: [...issue.path, key] }))
      : [{ issue, path: [...issue.path] }]
  );
  const sorted = [...flat].sort((a, b) => comparePaths(a.path, b.path));
  const errors: FieldError[] = sorted.map(({ issue, path }) => ({
    field: formatPath(path),
    message: formatIssueMessage(issue),
    code: issue.code
  }));
  return errors.filter(
    (error, index) =>
      errors.findIndex(
        (other) =>
          other.field === error.field && other.message === error.message
      ) === index
  );
}

function comparePaths(
  a: ReadonlyArray<PropertyKey>,
  b: ReadonlyArray<PropertyKey>
): number {
  const index = a.findIndex((segment, i) => segment !== b[i]);
  if (index === -1) return a.length - b.length;
  if (index >= b.length) return 1;
  const left = a[index];
  const right = b[index];
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}
