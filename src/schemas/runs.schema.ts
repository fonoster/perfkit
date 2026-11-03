/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `runs.json`, `schema: perfkit/runs/v1`: the history index of a project's
 * runs, newest first. Each entry keeps only the headline numbers the history
 * table needs; the full results are in the run's report.json.
 */
import { z } from "zod/v4";
import { checkUniqueIds } from "./checkUniqueIds.js";
import { checkVerdictCounts } from "./checkVerdictCounts.js";
import { formatRunId } from "./formatRunId.js";
import {
  benchmarkIdSchema,
  commitSchema,
  nonEmptyString,
  runIdSchema,
  SCHEMA_IDS,
  timestampSchema,
  verdictSummarySchema
} from "./primitives.schema.js";

const capacityRunHeadlineSchema = z
  .strictObject({
    limitCps: z.number().nullable(),
    p99AtLimitMs: z.number().nullable()
  })
  .refine(
    (headline) => (headline.limitCps === null) === (headline.p99AtLimitMs === null),
    { error: "expected limitCps and p99AtLimitMs both null or both numbers" }
  );

const unmeasured = z.enum(["inconclusive", "aborted", "not-run"]);

export const runBenchmarkSchema = z.discriminatedUnion("kind", [
  z.discriminatedUnion("verdict", [
    z.strictObject({
      id: benchmarkIdSchema,
      kind: z.literal("capacity"),
      verdict: z.enum(["passed", "failed"]),
      headline: capacityRunHeadlineSchema
    }),
    z.strictObject({
      id: benchmarkIdSchema,
      kind: z.literal("capacity"),
      verdict: unmeasured,
      headline: z.null()
    })
  ]),
  z.discriminatedUnion("verdict", [
    z.strictObject({
      id: benchmarkIdSchema,
      kind: z.literal("soak"),
      verdict: z.enum(["passed", "failed"]),
      headline: z.strictObject({ memoryGrowthMBPerHour: z.number() })
    }),
    z.strictObject({
      id: benchmarkIdSchema,
      kind: z.literal("soak"),
      verdict: unmeasured,
      headline: z.null()
    })
  ])
]);

const relativeDirSchema = nonEmptyString.refine(
  (value) => !/^([/\\]|[A-Za-z]:)/.test(value) && !value.includes("://"),
  { error: "expected a path relative to runs.json" }
);

export const runEntrySchema = z
  .strictObject({
    id: runIdSchema,
    startedAt: timestampSchema,
    version: nonEmptyString,
    commit: commitSchema,
    path: relativeDirSchema,
    verdict: verdictSummarySchema,
    benchmarks: z
      .array(runBenchmarkSchema)
      .min(1, { error: "expected at least one benchmark" })
      .superRefine(checkUniqueIds)
  })
  .superRefine((run, ctx) => {
    const expected = formatRunId(run.startedAt, run.commit);
    if (run.id !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `expected ${expected}, from startedAt and commit; got ${JSON.stringify(run.id)}`,
        input: run.id
      });
    }
    checkVerdictCounts(run.verdict, run.benchmarks, ctx);
  });

export const runsSchema = z
  .strictObject({
    schema: z.literal(SCHEMA_IDS.runs),
    project: nonEmptyString,
    runs: z.array(runEntrySchema).superRefine((runs, ctx) => {
      runs.forEach((run, index) => {
        const previous = runs[index - 1];
        if (previous && Date.parse(run.startedAt) > Date.parse(previous.startedAt)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "startedAt"],
            message: `expected runs newest first; this run started after runs[${index - 1}]`,
            input: run.startedAt
          });
        }
        const first = runs.findIndex((other) => other.id === run.id);
        if (first !== index) {
          ctx.addIssue({
            code: "custom",
            path: [index, "id"],
            message: `duplicate id ${JSON.stringify(run.id)}; runs[${first}] already uses it`,
            input: run.id
          });
        }
      });
    })
  })
  .meta({
    title: "runs.json v1",
    description:
      "The history index of a project's perfkit runs, newest first (schema: perfkit/runs/v1)."
  });

export type Runs = z.infer<typeof runsSchema>;
export type RunEntry = z.infer<typeof runEntrySchema>;
export type RunBenchmark = z.infer<typeof runBenchmarkSchema>;
