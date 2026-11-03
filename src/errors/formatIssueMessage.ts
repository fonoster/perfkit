/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { describeValue } from "./describeValue.js";

type Issue = z.core.$ZodIssue;

/**
 * Turns one Zod issue into the message part of an error line. A missing field
 * reads `required`, an enum mismatch `expected one of a, b; got "c"`, a wrong
 * type `expected number; got "5"`. Parse with `{ reportInput: true }` so the
 * issue carries the offending value.
 */
export function formatIssueMessage(issue: Issue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined
        ? "required"
        : `expected ${issue.expected}; got ${describeValue(issue.input)}`;
    case "invalid_value":
      if (issue.input === undefined) return "required";
      return issue.values.length === 1
        ? `expected ${String(issue.values[0])}; got ${describeValue(issue.input)}`
        : `expected one of ${issue.values.map(String).join(", ")}; got ${describeValue(issue.input)}`;
    case "invalid_union": {
      const { discriminator, options } = issue as Issue & {
        discriminator?: string;
        options?: unknown[];
      };
      if (!discriminator || !options) return "does not match any allowed shape";
      const input = issue.input as Record<string, unknown> | undefined;
      const value = input?.[discriminator];
      return value === undefined
        ? "required"
        : `expected one of ${options.map(String).join(", ")}; got ${describeValue(value)}`;
    }
    case "unrecognized_keys":
      return "unknown key";
    case "invalid_format":
      return typeof issue.input === "string"
        ? `${issue.message}; got ${describeValue(issue.input)}`
        : issue.message;
    case "too_small":
    case "too_big":
      return typeof issue.input === "number"
        ? `${issue.message}; got ${describeValue(issue.input)}`
        : issue.message;
    default:
      return issue.message;
  }
}
