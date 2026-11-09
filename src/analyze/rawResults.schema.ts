/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The perfkit-internal files in a benchmark's raw results directory,
 * `<out>/<run-id>/raw/<benchmark-id>/`: meta.json, sampler.jsonl and
 * udp.jsonl. The orchestration writes them and the analyzers read them.
 */
import { z } from "zod/v4";
import {
  count,
  nonEmptyString,
  nonNegativeNumber,
  positiveNumber,
  timestampSchema
} from "../schemas/primitives.schema.js";

const metaFields = {
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  durationS: nonNegativeNumber,
  tool: nonEmptyString
};

const stepWindowSchema = z.strictObject({
  offeredCps: positiveNumber,
  from: timestampSchema,
  to: timestampSchema
});

export const capacityMetaSchema = z.strictObject({
  ...metaFields,
  kind: z.literal("capacity"),
  steps: z
    .array(stepWindowSchema)
    .min(1, { error: "expected at least one step" }),
  registerUsers: count.default(0)
});

/** Where a soak's rate came from, when perfkit.yaml has `rate.fromCapacity`. */
export const rateSourceSchema = z.strictObject({
  fromCapacity: nonEmptyString,
  /** That benchmark's limit; null when it found none and fallbackCps ran. */
  limit: nonNegativeNumber.nullable(),
  fraction: positiveNumber,
  /** True when the limit is a lower bound: the load generator gave out first. */
  lowerBound: z.boolean().optional()
});

export const soakMetaSchema = z.strictObject({
  ...metaFields,
  kind: z.literal("soak"),
  load: z.strictObject({
    cps: positiveNumber,
    holdS: nonNegativeNumber,
    rateSource: rateSourceSchema.optional()
  }),
  registerUsers: count.default(0)
});

/** The host a sampler line comes from: the UUT, a load generator or a worker. */
const samplerHostSchema = z.union([
  z.enum(["uut", "loadgen"]),
  z.templateLiteral(["worker-", z.number().int().positive()])
]);

export const samplerLineSchema = z.strictObject({
  t: timestampSchema,
  host: samplerHostSchema,
  name: nonEmptyString,
  pid: positiveNumber.int({ error: "expected a whole number" }),
  rssKB: nonNegativeNumber,
  cpuTicks: nonNegativeNumber,
  clkTck: positiveNumber,
  fds: count
});

export const udpLineSchema = z.strictObject({
  t: timestampSchema,
  host: samplerHostSchema,
  RcvbufErrors: count,
  SndbufErrors: count,
  InErrors: count
});

const otlpAttributeSchema = z.looseObject({
  key: z.string(),
  value: z.looseObject({ stringValue: z.string().optional() })
});

const unixNanoSchema = z.union([
  z.string().regex(/^\d+$/, { error: "expected nanoseconds as digits" }),
  nonNegativeNumber
]);

const otlpSpanSchema = z.looseObject({
  traceId: nonEmptyString,
  spanId: nonEmptyString,
  parentSpanId: z.string().optional(),
  kind: z.union([z.number(), z.string()]).optional(),
  startTimeUnixNano: unixNanoSchema,
  endTimeUnixNano: unixNanoSchema,
  attributes: z.array(otlpAttributeSchema).optional()
});

/** One line of the OpenTelemetry Collector file exporter (OTLP JSON). */
export const otlpLineSchema = z.looseObject({
  resourceSpans: z
    .array(
      z.looseObject({
        resource: z
          .looseObject({ attributes: z.array(otlpAttributeSchema).optional() })
          .optional(),
        scopeSpans: z
          .array(z.looseObject({ spans: z.array(otlpSpanSchema).optional() }))
          .optional()
      })
    )
    .optional()
});

export type CapacityMeta = z.infer<typeof capacityMetaSchema>;
export type SoakMeta = z.infer<typeof soakMetaSchema>;
export type RateSource = z.infer<typeof rateSourceSchema>;
export type SamplerLine = z.infer<typeof samplerLineSchema>;
export type UdpLine = z.infer<typeof udpLineSchema>;
export type OtlpLine = z.infer<typeof otlpLineSchema>;
export type OtlpAttribute = z.infer<typeof otlpAttributeSchema>;
