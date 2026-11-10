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
import { checkClusterForHelm } from "./checkClusterForHelm.js";
import { checkFromCapacity } from "./checkFromCapacity.js";
import { checkUniqueIds } from "./checkUniqueIds.js";
import { projectLiveSchema } from "./report.schema.js";
import { checkStartCoversInstances } from "./checkStartCoversInstances.js";
import { checkStepEveryMultipleOfSippInterval } from "./checkStepEveryMultipleOfSippInterval.js";
import { checkSettleShorterThanDuration } from "./checkSettleShorterThanDuration.js";
import { checkWarmupShorterThanStep } from "./checkWarmupShorterThanStep.js";
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
  favicon: relativePathSchema
    .refine((value) => value.toLowerCase().endsWith(".svg"), {
      error: "expected an .svg file"
    })
    .optional(),
  title: nonEmptyString,
  lead: nonEmptyString,
  live: projectLiveSchema.optional()
});

/**
 * The agent's live.json server: its port on the load generator, the static
 * ngrok domain its tunnel uses when NGROK_AUTHTOKEN is set, and the URL the
 * benchmarks page polls (`project.live.url` is the same and wins).
 */
const configLiveSchema = z.strictObject({
  domain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, {
      error: "expected a hostname like perfkit.ngrok.app"
    })
    .optional(),
  port: z
    .number()
    .int({ error: "expected a whole number" })
    .min(1, { error: "expected a port from 1 to 65535" })
    .max(65535, { error: "expected a port from 1 to 65535" })
    .default(8787),
  /** Where the page polls live.json; default https://<domain>/live.json. */
  url: siteUrlSchema.optional()
});

const machineSizeSchema = z.strictObject({
  size: nonEmptyString
});

/**
 * The Kubernetes cluster of the benchmarks with `uut.helm`: a DOKS node pool
 * of `nodes` droplets of `size` (kind on this machine with --local).
 */
const configClusterSchema = z.strictObject({
  size: nonEmptyString,
  nodes: z
    .number()
    .int({ error: "expected a whole number" })
    .min(1, { error: "expected 1 node or more" })
    .max(20, { error: "expected 20 nodes or fewer" }),
  /** A DOKS version slug, like 1.33.1-do.0; `latest` by default. */
  version: nonEmptyString.default("latest")
});

/**
 * The load generator: `count` droplets of `size`. The first runs the agent and
 * the callees; the others only add uac SIPp processes, each with its own address
 * and its own pool of source ports (over TCP every call opens a connection).
 */
const loadgenSchema = machineSizeSchema.extend({
  count: z
    .number()
    .int({ error: "expected a whole number" })
    .min(1, { error: "expected 1 load generator or more" })
    .max(8, { error: "expected 8 load generators or fewer" })
    .default(1)
});

const configInfraSchema = z.strictObject({
  provider: z.literal("digitalocean").default("digitalocean"),
  region: nonEmptyString,
  uut: machineSizeSchema,
  loadgen: loadgenSchema,
  /** Required when a benchmark has `uut.helm`. */
  cluster: configClusterSchema.optional(),
  maxLifetime: durationSchema.default("9h")
});

const imageNameSchema = nonEmptyString.refine(
  (value) => !value.includes("@") && !/:[^/]*$/.test(value),
  {
    error:
      "expected an image name without a tag or digest; the tag comes from --target-version"
  }
);

/**
 * One `images` entry: an image name, tagged with `--target-version`, or
 * `{ name, tagSuffix }`, tagged with `--target-version` followed by
 * `tagSuffix` (like `2.32.0-go-experimental`).
 */
export const imageEntrySchema = z.union([
  imageNameSchema,
  z.strictObject({
    name: imageNameSchema,
    tagSuffix: z.string().regex(/^[A-Za-z0-9._-]+$/, {
      error: "expected a tag suffix of letters, digits, '.', '_' or '-'"
    })
  })
]);

export type ImageEntry = z.output<typeof imageEntrySchema>;

const configImagesSchema = z
  .record(z.string(), imageEntrySchema)
  .refine((images) => Object.keys(images).length > 0, {
    error: "expected at least one image"
  });

const processSchema = z.strictObject({
  name: nonEmptyString,
  match: nonEmptyString.refine(isRegExp, {
    error: "expected a valid regular expression"
  })
});

const portSchema = z
  .number()
  .int({ error: "expected a whole number" })
  .min(1, { error: "expected a port from 1 to 65535" })
  .max(65535, { error: "expected a port from 1 to 65535" });

/** The unit under test on the single server: a compose file. */
const composeUutSchema = z.strictObject({
  compose: relativePathSchema,
  setup: relativePathSchema.optional(),
  processes: z
    .array(processSchema)
    .min(1, { error: "expected at least one process" })
});

const dnsLabelSchema = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, {
    error: "expected a Kubernetes name: lowercase letters, digits and dashes"
  });

/** Pods sampled under one name: their CPU and memory are summed. */
const podSchema = z.strictObject({
  name: nonEmptyString,
  /** A label selector, like `app.kubernetes.io/name=edgeport`. */
  selector: nonEmptyString
});

/**
 * The unit under test on the Kubernetes cluster: a Helm chart, installed as
 * release `perfkit` in the namespace named after the benchmark.
 */
const helmSchema = z.strictObject({
  /** The chart's directory, with its dependencies in `charts/`. */
  chart: relativePathSchema,
  /** A values file with `${PERFKIT_*}` placeholders. */
  values: relativePathSchema,
  /** The Service SIPp sends to; its address is the target. */
  entry: z.strictObject({ service: dnsLabelSchema, port: portSchema }),
  /** Runs once the pods are Ready, with KUBECONFIG set. */
  setup: relativePathSchema.optional(),
  pods: z.array(podSchema).min(1, { error: "expected at least one pod" })
});

const helmUutSchema = z.strictObject({ helm: helmSchema });

const configUutSchema = z.union([composeUutSchema, helmUutSchema]);

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
  /** `tcp`: one connection per call (SIPp `-t tn`). */
  transport: z.enum(["udp", "tcp"]).default("udp"),
  /** The UUT's SIP port on the single server; unused with `uut.helm`. */
  port: portSchema.default(5060),
  uac: uacSchema,
  /**
   * How many SIPp processes place the calls: the rate, the open-call limit
   * and the `uac.users` file are split among them. SIPp is single-threaded,
   * so one process tops out at about one core's worth of calls.
   */
  instances: z
    .number()
    .int({ error: "expected a whole number of SIPp instances" })
    .min(1, { error: "expected 1 instance or more" })
    .max(64, { error: "expected 64 instances or fewer" })
    .default(1),
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

/**
 * A soak's rate: a fixed `cps`, or `fraction` of the limit a capacity
 * benchmark of the same run measured, rounded down; `fallbackCps` when that
 * benchmark found no limit or did not run.
 */
const soakRateSchema = z.union([
  z.strictObject({
    cps: positiveNumber
  }),
  z.strictObject({
    fromCapacity: benchmarkIdSchema,
    fraction: z
      .number()
      .gt(0, { error: "expected a fraction more than 0 and at most 1" })
      .lte(1, { error: "expected a fraction more than 0 and at most 1" }),
    fallbackCps: positiveNumber
  })
]);

const capacityLoadSchema = z.strictObject({
  ...loadFields,
  register: registerSchema.optional(),
  uas: uasSchema.optional(),
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
  failedCallsPct: percentSchema,
  /** How many steps in a row must break a rule to end the ramp; 1 ends it at the first. */
  confirmSteps: z.number().int().min(1).max(5).default(2)
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

export const capacityBenchmarkConfigSchema = z
  .strictObject({
    id: benchmarkIdSchema,
    kind: z.literal("capacity"),
    title: nonEmptyString,
    narrative: narrativeSchema,
    // The first step's measurement starts this long after the step does.
    warmup: durationSchema.default("0s"),
    uut: configUutSchema,
    load: capacityLoadSchema,
    telemetry: telemetrySchema,
    thresholds: capacityThresholdsSchema
  })
  .superRefine(checkWarmupShorterThanStep)
  .superRefine(checkStepEveryMultipleOfSippInterval)
  .superRefine(checkStartCoversInstances);

export const soakBenchmarkConfigSchema = z
  .strictObject({
    id: benchmarkIdSchema,
    kind: z.literal("soak"),
    title: nonEmptyString,
    narrative: narrativeSchema,
    duration: durationSchema,
    warmup: durationSchema,
    // Memory growth ignores this long after the warm-up while the heap
    // settles; the other rules don't. Default: 30m, or half of duration
    // when that is shorter (settleSeconds).
    settle: durationSchema.optional(),
    uut: configUutSchema,
    load: soakLoadSchema,
    telemetry: telemetrySchema,
    thresholds: soakThresholdsSchema
  })
  .superRefine(checkSettleShorterThanDuration);

export const benchmarkConfigSchema = z.discriminatedUnion("kind", [
  capacityBenchmarkConfigSchema,
  soakBenchmarkConfigSchema
]);

export const perfkitConfigSchema = z
  .strictObject({
    apiVersion: z.literal(SCHEMA_IDS.config),
    project: configProjectSchema,
    infra: configInfraSchema,
    live: configLiveSchema.optional(),
    images: configImagesSchema,
    benchmarks: z
      .array(benchmarkConfigSchema)
      .min(1, { error: "expected at least one benchmark" })
      .superRefine(checkUniqueIds)
      .superRefine(checkFromCapacity)
  })
  .superRefine(checkClusterForHelm)
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
export type UutConfig = z.output<typeof configUutSchema>;
export type HelmUutConfig = z.output<typeof helmUutSchema>;
export type ComposeUutConfig = z.output<typeof composeUutSchema>;
export type ClusterConfig = z.output<typeof configClusterSchema>;
export type SoakRateConfig = z.output<typeof soakRateSchema>;

function isRegExp(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}
