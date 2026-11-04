/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `perf/perfkit.yaml`, `apiVersion: perfkit/v1`: one project's benchmark
 * definitions. Objects are strict, so unknown keys are rejected. That every
 * path exists is checked by `perfkit validate`, not here: a schema can't see
 * the file system.
 */
import { z } from "zod/v4";
import { checkUniqueIds } from "./checkUniqueIds.js";
import {
  benchmarkIdSchema,
  count,
  durationSchema,
  hexColorSchema,
  nonEmptyString,
  nonNegativeNumber,
  positiveNumber,
  repoSchema,
  SCHEMA_IDS,
  siteUrlSchema
} from "./primitives.schema.js";

/** A path relative to the directory of the perfkit.yaml file. */
export const relativePathSchema = nonEmptyString.refine(
  (value) => !/^([/\\]|[A-Za-z]:)/.test(value),
  { error: "expected a path relative to the perfkit.yaml file" }
);

const configProjectSchema = z.strictObject({
  name: nonEmptyString,
  repo: repoSchema,
  siteUrl: siteUrlSchema,
  accent: hexColorSchema,
  logo: relativePathSchema
    .refine((value) => value.toLowerCase().endsWith(".svg"), {
      error: "expected an .svg file"
    })
    .optional(),
  title: nonEmptyString,
  lead: nonEmptyString
});

const machineSizeSchema = z.strictObject({
  size: nonEmptyString
});

const configInfraSchema = z.strictObject({
  provider: z.literal("digitalocean").default("digitalocean"),
  region: nonEmptyString,
  uut: machineSizeSchema,
  loadgen: machineSizeSchema,
  maxLifetime: durationSchema.default("9h")
});

const imageNameSchema = nonEmptyString.refine(
  (value) => !value.includes("@") && !/:[^/]*$/.test(value),
  {
    error:
      "expected an image name without a tag or digest; the tag comes from --target-version"
  }
);

const configImagesSchema = z
  .record(z.string(), imageNameSchema)
  .refine((images) => Object.keys(images).length > 0, {
    error: "expected at least one image"
  });

const processSchema = z.strictObject({
  name: nonEmptyString,
  match: nonEmptyString.refine(isRegExp, {
    error: "expected a valid regular expression"
  })
});

const configUutSchema = z.strictObject({
  compose: relativePathSchema,
  setup: relativePathSchema.optional(),
  processes: z
    .array(processSchema)
    .min(1, { error: "expected at least one process" })
});

const uacSchema = z.strictObject({
  scenario: relativePathSchema,
  users: relativePathSchema.optional()
});

const registerSchema = z.strictObject({
  scenario: relativePathSchema,
  users: relativePathSchema,
  expires: z
    .number()
    .int({ error: "expected a whole number of seconds" })
    .positive({ error: "must be more than 0" })
    .default(300)
});

const uasSchema = z.strictObject({
  scenario: relativePathSchema
});

const loadFields = {
  tool: z.literal("sipp"),
  transport: z.literal("udp"),
  port: z
    .number()
    .int({ error: "expected a whole number" })
    .min(1, { error: "expected a port from 1 to 65535" })
    .max(65535, { error: "expected a port from 1 to 65535" })
    .default(5060),
  uac: uacSchema,
  hold: durationSchema.default("0s"),
  // What one SIPp "call" is, as a plural noun for the page: "calls", "messages".
  unit: z
    .string()
    .regex(/^[a-z]+$/, { error: "expected a lowercase plural noun" })
    .default("calls")
};

const capacityRateSchema = z.strictObject({
  start: positiveNumber,
  step: positiveNumber,
  every: durationSchema,
  max: positiveNumber
});

const soakRateSchema = z.strictObject({
  cps: positiveNumber
});

const capacityLoadSchema = z.strictObject({
  ...loadFields,
  rate: capacityRateSchema
});

const soakLoadSchema = z.strictObject({
  ...loadFields,
  register: registerSchema.optional(),
  uas: uasSchema.optional(),
  rate: soakRateSchema
});

const telemetrySchema = z
  .strictObject({
    otlp: z.boolean(),
    sampleRatio: z
      .number()
      .gt(0, { error: "expected a ratio more than 0 and at most 1" })
      .lte(1, { error: "expected a ratio more than 0 and at most 1" })
      .default(0.01)
  })
  .default({ otlp: false, sampleRatio: 0.01 });

const percentSchema = nonNegativeNumber.max(100, {
  error: "expected a percentage from 0 to 100"
});

const capacityThresholdsSchema = z.strictObject({
  p99LatencyMs: positiveNumber,
  failedCallsPct: percentSchema
});

const soakThresholdsSchema = z.strictObject({
  memoryGrowthMBPerHour: nonNegativeNumber,
  failedCallsPct: percentSchema,
  restarts: count
});

const narrativeSchema = z.strictObject({
  what: nonEmptyString,
  why: nonEmptyString,
  how: nonEmptyString
});

export const capacityBenchmarkConfigSchema = z.strictObject({
  id: benchmarkIdSchema,
  kind: z.literal("capacity"),
  title: nonEmptyString,
  narrative: narrativeSchema,
  uut: configUutSchema,
  load: capacityLoadSchema,
  telemetry: telemetrySchema,
  thresholds: capacityThresholdsSchema
});

export const soakBenchmarkConfigSchema = z.strictObject({
  id: benchmarkIdSchema,
  kind: z.literal("soak"),
  title: nonEmptyString,
  narrative: narrativeSchema,
  duration: durationSchema,
  warmup: durationSchema,
  uut: configUutSchema,
  load: soakLoadSchema,
  telemetry: telemetrySchema,
  thresholds: soakThresholdsSchema
});

export const benchmarkConfigSchema = z.discriminatedUnion("kind", [
  capacityBenchmarkConfigSchema,
  soakBenchmarkConfigSchema
]);

export const perfkitConfigSchema = z
  .strictObject({
    apiVersion: z.literal(SCHEMA_IDS.config),
    project: configProjectSchema,
    infra: configInfraSchema,
    images: configImagesSchema,
    benchmarks: z
      .array(benchmarkConfigSchema)
      .min(1, { error: "expected at least one benchmark" })
      .superRefine(checkUniqueIds)
  })
  .meta({
    title: "perfkit.yaml v1",
    description:
      "A project's benchmark definitions (apiVersion: perfkit/v1). Every path is relative to the directory of the perfkit.yaml file."
  });

/** perfkit.yaml after parsing, with every default filled in. */
export type PerfkitConfig = z.output<typeof perfkitConfigSchema>;
/** perfkit.yaml as written, before defaults. */
export type PerfkitConfigInput = z.input<typeof perfkitConfigSchema>;
export type BenchmarkConfig = z.output<typeof benchmarkConfigSchema>;
export type CapacityBenchmarkConfig = z.output<
  typeof capacityBenchmarkConfigSchema
>;
export type SoakBenchmarkConfig = z.output<typeof soakBenchmarkConfigSchema>;

function isRegExp(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}
