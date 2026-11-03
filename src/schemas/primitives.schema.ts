/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Building blocks shared by the perfkit.yaml, report.json and runs.json
 * schemas. Field names, enums and units are part of the v1 contract.
 */
import { z } from "zod/v4";

export const SCHEMA_IDS = {
  config: "perfkit/v1",
  report: "perfkit/report/v1",
  runs: "perfkit/runs/v1"
} as const;

export const BENCHMARK_KINDS = ["capacity", "soak"] as const;

/** In this order; error messages and the page list them this way. */
export const VERDICTS = [
  "passed",
  "failed",
  "inconclusive",
  "aborted",
  "not-run"
] as const;

export const CAPACITY_RULE_IDS = ["p99InviteToOkMs", "failedCallsPct"] as const;

export const SOAK_RULE_IDS = [
  "memoryGrowthMBPerHour",
  "failedCallsPct",
  "restarts"
] as const;

export const nonEmptyString = z.string().min(1, { error: "must not be empty" });

/** `<n>s`, `<n>m` or `<n>h`. */
export const durationSchema = z
  .string()
  .regex(/^\d+[smh]$/, { error: "expected a duration like 30s, 10m or 6h" });

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: "expected a 6-digit hex color like #5FCFCE" });

export const repoSchema = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, { error: "expected a GitHub repo like fonoster/routr" });

export const siteUrlSchema = z.url({
  protocol: /^https?$/,
  error: "expected an http or https URL"
});

export const benchmarkIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, { error: "expected lowercase letters, digits and dashes" });

export const commitSchema = z
  .string()
  .regex(/^[0-9a-f]{7,40}$/, { error: "expected a git commit sha, 7 to 40 hex digits" });

export const runIdSchema = z
  .string()
  .regex(/^\d{8}T\d{6}Z-[0-9a-f]{7}$/, {
    error: "expected <startedAt as YYYYMMDDTHHMMSSZ>-<first 7 of commit>"
  });

export const timestampSchema = z.iso.datetime({
  error: "expected a UTC timestamp like 2026-11-03T14:12:10Z"
});

export const kindSchema = z.enum(BENCHMARK_KINDS);
export const verdictSchema = z.enum(VERDICTS);

export const nonNegativeNumber = z
  .number()
  .nonnegative({ error: "must be 0 or more" });

export const positiveNumber = z.number().positive({ error: "must be more than 0" });

export const count = z
  .number()
  .int({ error: "expected a whole number" })
  .nonnegative({ error: "must be 0 or more" });

/** How many benchmarks ended with each verdict. */
export const verdictSummarySchema = z.strictObject({
  total: count,
  passed: count,
  failed: count,
  inconclusive: count,
  aborted: count,
  notRun: count
});

export type BenchmarkKind = z.infer<typeof kindSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type VerdictSummary = z.infer<typeof verdictSummarySchema>;
export type SchemaId = (typeof SCHEMA_IDS)[keyof typeof SCHEMA_IDS];
