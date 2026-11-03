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
    .min(1, { error: "expected at least one step" })
});

export const soakMetaSchema = z.strictObject({
  ...metaFields,
  kind: z.literal("soak"),
  load: z.strictObject({
    cps: positiveNumber,
    holdS: nonNegativeNumber
  }),
  registerUsers: count.default(0)
});

export const samplerLineSchema = z.strictObject({
  t: timestampSchema,
  host: z.enum(["uut", "loadgen"]),
  name: nonEmptyString,
  pid: positiveNumber.int({ error: "expected a whole number" }),
  rssKB: nonNegativeNumber,
  cpuTicks: nonNegativeNumber,
  clkTck: positiveNumber,
  fds: count
});

export const udpLineSchema = z.strictObject({
  t: timestampSchema,
  host: z.enum(["uut", "loadgen"]),
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
export type SamplerLine = z.infer<typeof samplerLineSchema>;
export type UdpLine = z.infer<typeof udpLineSchema>;
export type OtlpLine = z.infer<typeof otlpLineSchema>;
export type OtlpAttribute = z.infer<typeof otlpAttributeSchema>;
