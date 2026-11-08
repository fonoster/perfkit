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
  const flat = issues.flatMap(expandUnion).flatMap<{
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

/**
 * An object that matches no shape of a union, like a `uut` with `helm` and
 * a missing `pods`, gets the issues of the shape it is closest to: the one
 * with the fewest issues, where an unknown key counts twice, being the
 * surest sign of the wrong shape. When two shapes tie, it stays one
 * `does not match any allowed shape` issue.
 */
function expandUnion(issue: z.core.$ZodIssue): z.core.$ZodIssue[] {
  if (issue.code !== "invalid_union") return [issue];
  const { errors, input } = issue as z.core.$ZodIssue & {
    errors?: z.core.$ZodIssue[][];
    discriminator?: string;
  };
  if (
    (issue as { discriminator?: string }).discriminator !== undefined ||
    !errors ||
    errors.length < 2 ||
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return [issue];
  }
  const weight = (branch: z.core.$ZodIssue[]) =>
    branch.reduce(
      (sum, item) =>
        sum + (item.code === "unrecognized_keys" ? 2 * item.keys.length : 1),
      0
    );
  const weights = errors.map(weight);
  const best = Math.min(...weights);
  if (weights.filter((value) => value === best).length > 1) return [issue];
  const branch = errors[weights.indexOf(best)] ?? [];
  return branch
    .map((item) => ({ ...item, path: [...issue.path, ...item.path] }))
    .flatMap(expandUnion);
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
