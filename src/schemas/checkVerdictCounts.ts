/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import type { Verdict, VerdictSummary } from "./primitives.schema.js";

const FIELD_BY_VERDICT: Record<Verdict, keyof VerdictSummary> = {
  passed: "passed",
  failed: "failed",
  inconclusive: "inconclusive",
  aborted: "aborted",
  "not-run": "notRun"
};

/**
 * Adds an issue at `verdict.<field>` for every count in the summary that does
 * not match the benchmarks' verdicts. `total` is the number of benchmarks.
 */
export function checkVerdictCounts(
  summary: VerdictSummary,
  benchmarks: ReadonlyArray<{ verdict: Verdict }>,
  ctx: z.core.$RefinementCtx
): void {
  const expected: VerdictSummary = benchmarks.reduce(
    (acc, { verdict }) => ({
      ...acc,
      [FIELD_BY_VERDICT[verdict]]: acc[FIELD_BY_VERDICT[verdict]] + 1
    }),
    {
      total: benchmarks.length,
      passed: 0,
      failed: 0,
      inconclusive: 0,
      aborted: 0,
      notRun: 0
    }
  );
  (Object.keys(expected) as Array<keyof VerdictSummary>)
    .filter((field) => expected[field] !== summary[field])
    .forEach((field) => {
      ctx.addIssue({
        code: "custom",
        path: ["verdict", field],
        message: `expected ${expected[field]} to match benchmarks; got ${summary[field]}`,
        input: summary[field]
      });
    });
}
