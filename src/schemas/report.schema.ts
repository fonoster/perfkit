/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `report.json`, `schema: perfkit/report/v1`: the results of one run. Which
 * fields a benchmark carries depends on its kind and verdict; each pair is a
 * strict object, so a field that does not belong to it is rejected.
 */
import { z } from "zod/v4";
import { checkUniqueIds } from "./checkUniqueIds.js";
import { checkVerdictCounts } from "./checkVerdictCounts.js";
import { formatRunId } from "./formatRunId.js";
import {
  benchmarkIdSchema,
  CAPACITY_RULE_IDS,
  commitSchema,
  count,
  hexColorSchema,
  nonEmptyString,
  nonNegativeNumber,
  positiveNumber,
  repoSchema,
  runIdSchema,
  SCHEMA_IDS,
  siteUrlSchema,
  timestampSchema,
  verdictSummarySchema
} from "./primitives.schema.js";

/** A lowercase clause with no final period; the page builds sentences on it. */
export const reasonSchema = z.string().regex(/^[a-z](?:.*[^.])?$/s, {
  error: "expected a lowercase clause with no final period"
});

/** Where the benchmarks page polls a run in progress: its live.json URL. */
export const projectLiveSchema = z.strictObject({
  url: siteUrlSchema
});

export const reportProjectSchema = z.strictObject({
  name: nonEmptyString,
  repo: repoSchema,
  siteUrl: siteUrlSchema,
  accent: hexColorSchema,
  logoSvg: z
    .string()
    .regex(/<svg[\s>]/, { error: "expected inline SVG markup" })
    .optional(),
  faviconSvg: z
    .string()
    .regex(/<svg[\s>]/, { error: "expected inline SVG markup" })
    .optional(),
  title: nonEmptyString,
  lead: nonEmptyString,
  live: projectLiveSchema.optional()
});

const machineSchema = z.strictObject({
  size: nonEmptyString,
  vcpus: positiveNumber.int({ error: "expected a whole number" }),
  memoryMB: positiveNumber.int({ error: "expected a whole number" })
});

/** The Kubernetes cluster of the benchmarks whose target is `cluster`. */
export const runClusterSchema = z.strictObject({
  provider: z.enum(["digitalocean", "kind"]),
  nodes: positiveNumber.int({ error: "expected a whole number" }),
  /** The node droplet size, or `local` for kind. */
  size: nonEmptyString,
  /** The Kubernetes version, like 1.33.1-do.0 or v1.33.1. */
  version: nonEmptyString
});

const runInfraSchema = z.strictObject({
  provider: z.enum(["digitalocean", "local"]),
  region: nonEmptyString,
  uut: machineSchema,
  loadgen: machineSchema,
  os: nonEmptyString,
  docker: nonEmptyString,
  cluster: runClusterSchema.optional()
});

const pinnedImageSchema = z
  .string()
  .regex(/^[^@\s]+:[^@\s/:]+@sha256:[0-9a-f]{64}$/, {
    error: "expected an image pinned by digest, like name:tag@sha256:<64 hex>"
  });

const runSchema = z
  .strictObject({
    id: runIdSchema,
    version: nonEmptyString,
    commit: commitSchema,
    startedAt: timestampSchema,
    endedAt: timestampSchema,
    infra: runInfraSchema,
    images: z
      .record(z.string(), pinnedImageSchema)
      .refine((images) => Object.keys(images).length > 0, {
        error: "expected at least one image"
      }),
    tools: z.strictObject({
      perfkit: nonEmptyString,
      sipp: nonEmptyString,
      otelcol: nonEmptyString.optional()
    }),
    command: nonEmptyString
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
  });

const narrativeSchema = z.strictObject({
  what: nonEmptyString,
  why: nonEmptyString,
  how: nonEmptyString
});

const baseFields = {
  id: benchmarkIdSchema,
  title: nonEmptyString,
  narrative: narrativeSchema,
  // load.unit from perfkit.yaml: what one SIPp "call" is ("calls", "messages").
  unit: z.string().regex(/^[a-z]+$/, { error: "expected a lowercase plural noun" }),
  /** Where the unit under test ran; absent in older reports. */
  target: z.enum(["server", "cluster"]).optional()
};

const ruleFields = {
  limit: z.number(),
  measured: z.number(),
  passed: z.boolean()
};

export const capacityRuleSchema = z.strictObject({
  id: z.enum(CAPACITY_RULE_IDS),
  ...ruleFields
});

export const soakRuleSchema = z.discriminatedUnion("id", [
  z.strictObject({
    id: z.literal("memoryGrowthMBPerHour"),
    process: nonEmptyString,
    ...ruleFields
  }),
  z.strictObject({
    id: z.enum(["failedCallsPct", "restarts"]),
    ...ruleFields
  })
]);

const sampleSchema = z.strictObject({
  t: timestampSchema,
  rssMB: nonNegativeNumber,
  cpuPct: nonNegativeNumber,
  fds: count,
  pid: positiveNumber.int({ error: "expected a whole number" })
});

export const resourcesSchema = z.strictObject({
  processes: z.array(
    z.strictObject({
      name: nonEmptyString,
      samples: z.array(sampleSchema)
    })
  )
});

export const stepSchema = z.strictObject({
  offeredCps: nonNegativeNumber,
  achievedCps: nonNegativeNumber,
  calls: count,
  p50Ms: nonNegativeNumber,
  p95Ms: nonNegativeNumber,
  p99Ms: nonNegativeNumber,
  failed: count,
  failuresByReason: z.record(z.string(), count),
  retransmissions: count,
  sippCpuPct: nonNegativeNumber,
  uutCpuPct: nonNegativeNumber,
  loadgenUdpDrops: count,
  uutUdpDrops: count,
  valid: z.boolean(),
  /** True when the step broke a rule but the next one passed: a spike, not the limit. */
  spike: z.boolean().optional()
});

export const seriesSchema = z.strictObject({
  steps: z.array(stepSchema)
});

export const hopsSchema = z.strictObject({
  sampleRatio: z.number().gt(0).lte(1),
  spans: count,
  services: z.array(
    z.strictObject({
      service: nonEmptyString,
      p50Ms: nonNegativeNumber,
      p99Ms: nonNegativeNumber
    })
  )
});

const nullableNumber = z.number().nullable();

export const capacityHeadlineSchema = z
  .strictObject({
    limitCps: nonNegativeNumber.nullable(),
    limitIsLowerBound: z.boolean(),
    p99AtLimitMs: nullableNumber,
    p50AtLimitMs: nullableNumber,
    failedAtLimitPct: nullableNumber,
    retransmissionsAtLimitPct: nullableNumber
  })
  .superRefine((headline, ctx) => {
    if (headline.limitCps !== null) return;
    if (headline.limitIsLowerBound) {
      ctx.addIssue({
        code: "custom",
        path: ["limitIsLowerBound"],
        message: "expected false when limitCps is null",
        input: true
      });
    }
    (
      [
        "p99AtLimitMs",
        "p50AtLimitMs",
        "failedAtLimitPct",
        "retransmissionsAtLimitPct"
      ] as const
    )
      .filter((field) => headline[field] !== null)
      .forEach((field) => {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "expected null when limitCps is null",
          input: headline[field]
        });
      });
  });

export const stoppedBySchema = z.strictObject({
  offeredCps: nonNegativeNumber,
  rule: z.enum(CAPACITY_RULE_IDS),
  measured: z.number(),
  limit: z.number()
});

export const soakHeadlineSchema = z.strictObject({
  memoryGrowthMBPerHour: z.number(),
  calls: count,
  registrations: count,
  registerFailures: count
});

const capacityMeasuredSchema = z
  .strictObject({
    ...baseFields,
    kind: z.literal("capacity"),
    verdict: z.enum(["passed", "failed"]),
    reason: z.null(),
    durationS: nonNegativeNumber,
    tool: nonEmptyString,
    rules: z.array(capacityRuleSchema),
    headline: capacityHeadlineSchema,
    stoppedBy: stoppedBySchema.nullable(),
    series: seriesSchema,
    resources: resourcesSchema,
    hops: hopsSchema.optional()
  })
  .superRefine((benchmark, ctx) => {
    if (benchmark.headline.limitIsLowerBound && benchmark.stoppedBy !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["stoppedBy"],
        message: "expected null when headline.limitIsLowerBound is true",
        input: benchmark.stoppedBy
      });
    }
    checkRulesMatchVerdict(benchmark, ctx);
  });

const capacityPartialSchema = z.strictObject({
  ...baseFields,
  kind: z.literal("capacity"),
  verdict: z.enum(["inconclusive", "aborted"]),
  reason: reasonSchema,
  durationS: nonNegativeNumber,
  tool: nonEmptyString,
  series: seriesSchema.optional(),
  resources: resourcesSchema.optional()
});

const capacityNotRunSchema = z.strictObject({
  ...baseFields,
  kind: z.literal("capacity"),
  verdict: z.literal("not-run"),
  reason: reasonSchema
});

const soakMeasuredSchema = z
  .strictObject({
    ...baseFields,
    kind: z.literal("soak"),
    verdict: z.enum(["passed", "failed"]),
    reason: z.null(),
    durationS: nonNegativeNumber,
    warmupS: nonNegativeNumber,
    tool: nonEmptyString,
    load: z.strictObject({
      cps: positiveNumber,
      holdS: nonNegativeNumber,
      /**
       * With `rate.fromCapacity`: the capacity benchmark, its limit (null
       * when it found none and `fallbackCps` ran), the fraction, and
       * whether the limit is a lower bound.
       */
      rateSource: z
        .strictObject({
          fromCapacity: benchmarkIdSchema,
          limit: nonNegativeNumber.nullable(),
          fraction: positiveNumber,
          /** The limit is a lower bound: the load generator gave out first. */
          lowerBound: z.boolean().optional()
        })
        .nullable()
        .optional()
    }),
    rules: z.array(soakRuleSchema),
    headline: soakHeadlineSchema,
    reported: z.strictObject({
      p99FirstHourMs: nonNegativeNumber,
      p99LastHourMs: nonNegativeNumber,
      maxOpenFds: z.record(z.string(), count),
      maxConcurrentCalls: count
    }),
    resources: resourcesSchema,
    hops: hopsSchema.optional()
  })
  .superRefine(checkRulesMatchVerdict);

const soakPartialSchema = z.strictObject({
  ...baseFields,
  kind: z.literal("soak"),
  verdict: z.enum(["inconclusive", "aborted"]),
  reason: reasonSchema,
  durationS: nonNegativeNumber,
  tool: nonEmptyString,
  resources: resourcesSchema.optional()
});

const soakNotRunSchema = z.strictObject({
  ...baseFields,
  kind: z.literal("soak"),
  verdict: z.literal("not-run"),
  reason: reasonSchema
});

export const capacityBenchmarkResultSchema = z.discriminatedUnion("verdict", [
  capacityMeasuredSchema,
  capacityPartialSchema,
  capacityNotRunSchema
]);

export const soakBenchmarkResultSchema = z.discriminatedUnion("verdict", [
  soakMeasuredSchema,
  soakPartialSchema,
  soakNotRunSchema
]);

export const benchmarkResultSchema = z.discriminatedUnion("kind", [
  capacityBenchmarkResultSchema,
  soakBenchmarkResultSchema
]);

export const reportSchema = z
  .strictObject({
    schema: z.literal(SCHEMA_IDS.report),
    project: reportProjectSchema,
    run: runSchema,
    verdict: verdictSummarySchema,
    benchmarks: z
      .array(benchmarkResultSchema)
      .min(1, { error: "expected at least one benchmark" })
      .superRefine(checkUniqueIds)
  })
  .superRefine((report, ctx) => {
    checkVerdictCounts(report.verdict, report.benchmarks, ctx);
    const hasHops = report.benchmarks.some(
      (benchmark) => "hops" in benchmark && benchmark.hops !== undefined
    );
    if (hasHops && report.run.tools.otelcol === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["run", "tools", "otelcol"],
        message: "required when a benchmark has hops"
      });
    }
  })
  .meta({
    title: "report.json v1",
    description:
      "The results of one perfkit run (schema: perfkit/report/v1). A breaking change is a new schema version."
  });

export type Report = z.infer<typeof reportSchema>;
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
export type CapacityBenchmarkResult = z.infer<
  typeof capacityBenchmarkResultSchema
>;
export type SoakBenchmarkResult = z.infer<typeof soakBenchmarkResultSchema>;
export type CapacityRule = z.infer<typeof capacityRuleSchema>;
export type SoakRule = z.infer<typeof soakRuleSchema>;
export type CapacityHeadline = z.infer<typeof capacityHeadlineSchema>;
export type SoakHeadline = z.infer<typeof soakHeadlineSchema>;
export type StoppedBy = z.infer<typeof stoppedBySchema>;
export type Step = z.infer<typeof stepSchema>;
export type Series = z.infer<typeof seriesSchema>;
export type Resources = z.infer<typeof resourcesSchema>;
export type RunCluster = z.infer<typeof runClusterSchema>;
export type Hops = z.infer<typeof hopsSchema>;

/** `passed` needs every rule passed; `failed` needs at least one failed. */
function checkRulesMatchVerdict(
  benchmark: { verdict: "passed" | "failed"; rules: Array<{ passed: boolean }> },
  ctx: z.core.$RefinementCtx
): void {
  const anyFailed = benchmark.rules.some((rule) => !rule.passed);
  if (benchmark.verdict === "passed" && anyFailed) {
    ctx.addIssue({
      code: "custom",
      path: ["verdict"],
      message: "expected failed, since a rule did not pass; got \"passed\"",
      input: benchmark.verdict
    });
  }
  if (benchmark.verdict === "failed" && !anyFailed) {
    ctx.addIssue({
      code: "custom",
      path: ["verdict"],
      message: "expected passed, since every rule passed; got \"failed\"",
      input: benchmark.verdict
    });
  }
}
