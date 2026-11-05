/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `live.json`, `schema: perfkit/live/v1`: a snapshot of a run in progress,
 * which the agent rewrites every 15 seconds and serves to the benchmarks
 * page. Every number in it is preliminary: the verdicts come from the
 * analyzer once the run is collected, never from this file.
 */
import { z } from "zod/v4";
import {
  benchmarkIdSchema,
  commitSchema,
  count,
  nonEmptyString,
  nonNegativeNumber,
  positiveNumber,
  runIdSchema,
  timestampSchema
} from "./primitives.schema.js";
import { reportProjectSchema } from "./report.schema.js";

export const LIVE_SCHEMA_ID = "perfkit/live/v1";

/** How often the agent rewrites live.json, and the page polls it. */
export const LIVE_INTERVAL_S = 15;

export const liveBenchmarkStateSchema = z.enum([
  "queued",
  "running",
  "done",
  "not-run"
]);

const unitSchema = z
  .string()
  .regex(/^[a-z]+$/, { error: "expected a lowercase plural noun" });

/** One evaluated capacity step, as the agent judged it when it ended. */
export const livePointSchema = z.strictObject({
  offeredCps: nonNegativeNumber,
  achievedCps: nonNegativeNumber,
  calls: count,
  failed: count,
  p50Ms: nonNegativeNumber,
  p95Ms: nonNegativeNumber,
  p99Ms: nonNegativeNumber,
  failedPct: nonNegativeNumber,
  /** True when the step met both rules and its measurement counts. */
  ok: z.boolean(),
  /** Why the ramp stopped at this step, or null. */
  stopReason: z.string().nullable()
});

const baseFields = {
  id: benchmarkIdSchema,
  title: nonEmptyString,
  unit: unitSchema,
  state: liveBenchmarkStateSchema,
  /** When the agent started the benchmark (compose up), or null. */
  startedAt: timestampSchema.nullable(),
  /** When SIPp started placing calls, or null. */
  loadStartedAt: timestampSchema.nullable(),
  /** When it is expected to start, for a queued benchmark; else null. */
  estimatedStartAt: timestampSchema.nullable(),
  /** The longest it runs once the load starts, in seconds. */
  plannedS: nonNegativeNumber
};

export const liveCapacitySchema = z.strictObject({
  ...baseFields,
  kind: z.literal("capacity"),
  rate: z.strictObject({
    start: positiveNumber,
    step: positiveNumber,
    everyS: positiveNumber,
    max: positiveNumber
  }),
  thresholds: z.strictObject({
    p99LatencyMs: positiveNumber,
    failedCallsPct: nonNegativeNumber
  }),
  /** The step SIPp is offering now, while running; else null. */
  current: z
    .strictObject({
      index: count,
      total: positiveNumber.int({ error: "expected a whole number" }),
      offeredCps: nonNegativeNumber
    })
    .nullable(),
  /** The steps evaluated so far, in order. */
  points: z.array(livePointSchema),
  /** The offered rate of the last step that passed, or null. */
  heldCps: nonNegativeNumber.nullable(),
  /** Once done: where the ramp ended, still preliminary. */
  result: z
    .strictObject({
      limitCps: nonNegativeNumber.nullable(),
      /** True when no step broke a rule: the limit is a lower bound. */
      lowerBound: z.boolean(),
      stopReason: z.string().nullable()
    })
    .nullable()
});

const liveSampleSchema = z.strictObject({
  t: timestampSchema,
  rssMB: nonNegativeNumber
});

/** At most this many samples per process in live.json. */
export const LIVE_MAX_SAMPLES = 300;

export const liveSoakSchema = z.strictObject({
  ...baseFields,
  kind: z.literal("soak"),
  cps: positiveNumber,
  warmupS: nonNegativeNumber,
  durationS: positiveNumber,
  /** Seconds since the load started, while running or done. */
  elapsedS: nonNegativeNumber,
  thresholds: z.strictObject({
    memoryGrowthMBPerHour: nonNegativeNumber,
    failedCallsPct: nonNegativeNumber
  }),
  /** Calls the uac started and failed so far (SIPp's counters). */
  calls: z.strictObject({ placed: count, failed: count }),
  memory: z.array(
    z.strictObject({
      name: nonEmptyString,
      samples: z
        .array(liveSampleSchema)
        .max(LIVE_MAX_SAMPLES, {
          error: `expected at most ${LIVE_MAX_SAMPLES} samples`
        }),
      /**
       * The least-squares growth after the warm-up, only once there is a
       * full hour of data after it; null before.
       */
      growthMBPerHour: z.number().nullable()
    })
  )
});

export const liveBenchmarkSchema = z.discriminatedUnion("kind", [
  liveCapacitySchema,
  liveSoakSchema
]);

export const liveSchema = z
  .strictObject({
    schema: z.literal(LIVE_SCHEMA_ID),
    runId: runIdSchema,
    version: nonEmptyString,
    commit: commitSchema,
    startedAt: timestampSchema,
    updatedAt: timestampSchema,
    status: z.enum(["running", "finished", "failed"]),
    /** Why the agent stopped the run, when status is failed; else null. */
    reason: z.string().nullable(),
    /** When the run is expected to end; null once it has. */
    estimatedEndAt: timestampSchema.nullable(),
    provider: z.enum(["digitalocean", "local"]),
    project: reportProjectSchema,
    benchmarks: z
      .array(liveBenchmarkSchema)
      .min(1, { error: "expected at least one benchmark" })
  })
  .meta({
    title: "live.json v1",
    description:
      "A preliminary snapshot of a perfkit run in progress (schema: perfkit/live/v1), rewritten every 15 seconds."
  });

export type Live = z.infer<typeof liveSchema>;
export type LiveBenchmark = z.infer<typeof liveBenchmarkSchema>;
export type LiveCapacity = z.infer<typeof liveCapacitySchema>;
export type LiveSoak = z.infer<typeof liveSoakSchema>;
export type LivePoint = z.infer<typeof livePointSchema>;
export type LiveBenchmarkState = z.infer<typeof liveBenchmarkStateSchema>;
