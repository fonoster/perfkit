/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The files a run keeps on its load generator (or, with --local, under
 * ~/.perfkit/runs/<id>/root): run.json, written once by the CLI, and
 * status.json, kept by the agent. Neither holds a secret. Both are read back
 * by other machines, so both are validated.
 */
import { z } from "zod/v4";
import { planSchema } from "../infra/infra.schema.js";
import { perfkitConfigSchema } from "../schemas/index.js";
import {
  benchmarkIdSchema,
  nonEmptyString,
  positiveNumber,
  runIdSchema,
  timestampSchema
} from "../schemas/primitives.schema.js";

const absolutePathSchema = z
  .string()
  .regex(/^\/\S*$/, { error: "expected an absolute path without spaces" });

const machineInfoSchema = z.strictObject({
  vcpus: positiveNumber.int({ error: "expected a whole number" }),
  memoryMB: positiveNumber.int({ error: "expected a whole number" }),
  os: nonEmptyString,
  docker: nonEmptyString
});

export const liveSettingsSchema = z.strictObject({
  port: z.number().int().min(1).max(65535),
  domain: z.string().min(1).nullable()
});

export const runModeSchema = z.enum(["digitalocean", "local"]);

export const runStateSchema = z.strictObject({
  runId: runIdSchema,
  mode: runModeSchema,
  /** Where everything lives: /opt/perfkit, or the local root. */
  root: absolutePathSchema,
  /** Containers are named `<prefix>-<run id>-<what>`. */
  namePrefix: z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/, {
    error: "expected lowercase letters, digits and dashes"
  }),
  perfkitVersion: nonEmptyString,
  command: nonEmptyString,
  plan: planSchema,
  config: perfkitConfigSchema,
  logoSvg: z.string().optional(),
  faviconSvg: z.string().optional(),
  hosts: z.strictObject({
    uutIp: z.ipv4(),
    loadgenIp: z.ipv4(),
    vpcCidr: nonEmptyString
  }),
  machines: z.strictObject({
    uut: machineInfoSchema,
    loadgen: machineInfoSchema
  }),
  tools: z.strictObject({
    sipp: nonEmptyString,
    otelcol: nonEmptyString.optional()
  }),
  /** Where live.json is served, and the static ngrok domain, if any. */
  live: liveSettingsSchema.optional()
});

const benchmarkStatusSchema = z.strictObject({
  state: z.enum(["pending", "running", "done"]),
  startedAt: timestampSchema.optional(),
  /** How long it runs at most, in seconds. */
  plannedS: z.number().nonnegative().optional()
});

export const runStatusSchema = z.strictObject({
  benchmarks: z.record(benchmarkIdSchema, benchmarkStatusSchema),
  done: z.boolean(),
  /** Why the agent stopped the whole run (exit 3), or null. */
  failed: z.string().nullable(),
  endedAt: timestampSchema.optional()
});

export const agentInputSchema = z.strictObject({
  root: absolutePathSchema,
  runId: runIdSchema
});

export type LiveSettings = z.infer<typeof liveSettingsSchema>;
export type RunMode = z.infer<typeof runModeSchema>;
export type RunState = z.infer<typeof runStateSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type MachineInfo = z.infer<typeof machineInfoSchema>;
export type AgentInput = z.infer<typeof agentInputSchema>;
