/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Inputs of the infra functions. A run's plan is validated again at
 * `provision` and `withRun`, so a hand-built plan can't skip a check.
 */
import { z } from "zod/v4";
import {
  benchmarkConfigSchema,
  durationSchema,
  imageEntrySchema,
  perfkitConfigSchema
} from "../schemas/index.js";
import {
  benchmarkIdSchema,
  commitSchema,
  nonEmptyString,
  runIdSchema,
  timestampSchema
} from "../schemas/primitives.schema.js";

/** A Docker image tag, as `--target-version` takes it. */
export const targetVersionSchema = z
  .string()
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/, {
    error: "expected an image tag like 2.31.5"
  });

const digestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, { error: "expected a sha256 digest" });

/** A public key in authorized_keys format, on one line. */
export const authorizedKeySchema = z
  .string()
  .regex(
    /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com) [A-Za-z0-9+/]+={0,3}( [^\r\n]*)?$/,
    { error: "expected one public key in authorized_keys format" }
  );

const ipv4Cidr32Schema = z
  .string()
  .refine(
    (value) =>
      value.endsWith("/32") && z.ipv4().safeParse(value.slice(0, -3)).success,
    { error: "expected an IPv4 address as a /32, like 203.0.113.7/32" }
  );

export const resolveImageDigestsInputSchema = z.strictObject({
  images: z
    .record(z.string(), imageEntrySchema)
    .refine((images) => Object.keys(images).length > 0, {
      error: "expected at least one image"
    }),
  tag: targetVersionSchema
});

export const planRunInputSchema = z
  .strictObject({
    config: perfkitConfigSchema,
    targetVersion: targetVersionSchema,
    commit: commitSchema,
    startedAt: timestampSchema,
    benchmarks: z
      .array(benchmarkIdSchema)
      .min(1, { error: "expected at least one benchmark id" })
      .optional()
  })
  .superRefine((input, ctx) => {
    const known = input.config.benchmarks.map(({ id }) => id);
    (input.benchmarks ?? []).forEach((id, index) => {
      if (!known.includes(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["benchmarks", index],
          message: `unknown benchmark "${id}"; perfkit.yaml has ${known.join(", ")}`
        });
      }
    });
  });

const dropletPlanSchema = z.strictObject({
  role: z.enum(["uut", "loadgen"]),
  name: z.string().regex(/^perfkit-[A-Za-z0-9.-]+$/, {
    error: "expected a droplet name starting with perfkit-"
  }),
  size: nonEmptyString,
  image: nonEmptyString
});

const resolvedImageSchema = z.strictObject({
  key: nonEmptyString,
  name: nonEmptyString,
  tag: targetVersionSchema,
  digest: digestSchema,
  ref: nonEmptyString
});

export const planSchema = z.strictObject({
  runId: runIdSchema,
  project: nonEmptyString,
  targetVersion: targetVersionSchema,
  commit: commitSchema,
  startedAt: timestampSchema,
  region: nonEmptyString,
  resourceName: z.string().regex(/^perfkit-\d{8}T\d{6}Z-[0-9a-f]{7}$/, {
    error: "expected perfkit-<run id>"
  }),
  runTag: z.string().regex(/^perfkit-run-\d{8}T\d{6}Z-[0-9a-f]{7}$/, {
    error: "expected perfkit-run-<run id>"
  }),
  tags: z.array(nonEmptyString).min(1, { error: "expected at least one tag" }),
  uut: dropletPlanSchema,
  loadgen: dropletPlanSchema,
  sshSource: ipv4Cidr32Schema,
  images: z.array(resolvedImageSchema).min(1, {
    error: "expected at least one image"
  }),
  benchmarks: z.array(benchmarkConfigSchema).min(1, {
    error: "expected at least one benchmark"
  }),
  maxLifetime: durationSchema
});

export const provisionOptionsSchema = z.strictObject({
  authorizedKeys: z.array(authorizedKeySchema).default([]),
  signal: z
    .custom<AbortSignal>((value) => value instanceof AbortSignal, {
      error: "expected an AbortSignal"
    })
    .optional()
});

export const provisionInputSchema = z.strictObject({
  plan: planSchema,
  options: provisionOptionsSchema.default({ authorizedKeys: [] })
});

const createdDropletSchema = z.strictObject({
  id: z.number().int().positive(),
  name: nonEmptyString,
  role: z.enum(["uut", "loadgen"]),
  publicIp: z.string().nullable(),
  privateIp: z.string().nullable()
});

/** What teardown deletes. Extra fields of a provisioned run are ignored. */
export const runResourcesSchema = z.object({
  runId: runIdSchema,
  runTag: nonEmptyString.optional(),
  sshKey: z
    .object({
      id: z.number().int().positive(),
      name: nonEmptyString,
      fingerprint: nonEmptyString,
      shared: z.boolean()
    })
    .optional(),
  vpc: z.object({ id: nonEmptyString, name: nonEmptyString }).optional(),
  droplets: z.array(createdDropletSchema.loose()),
  firewall: z.object({ id: nonEmptyString, name: nonEmptyString }).optional()
});

export const withRunInputSchema = z.strictObject({
  plan: planSchema,
  body: z.custom<(...args: never[]) => unknown>(
    (value) => typeof value === "function",
    { error: "expected a function" }
  ),
  options: provisionOptionsSchema
    .omit({ signal: true })
    .default({ authorizedKeys: [] })
});

export const allowSshInputSchema = z.strictObject({
  runId: runIdSchema,
  ip: z.ipv4({ error: "expected an IPv4 address like 203.0.113.7" })
});

export const sweepInputSchema = z.strictObject({
  olderThan: durationSchema.default("9h"),
  runId: runIdSchema.optional(),
  dryRun: z.boolean().default(false)
});

export type PlanRunInput = z.input<typeof planRunInputSchema>;
export type ResolveImageDigestsInput = z.infer<
  typeof resolveImageDigestsInputSchema
>;
export type ProvisionOptions = z.input<typeof provisionOptionsSchema>;
export type AllowSshInput = z.infer<typeof allowSshInputSchema>;
export type SweepInput = z.input<typeof sweepInputSchema>;
export type WithRunOptions = z.input<typeof withRunInputSchema>["options"];
