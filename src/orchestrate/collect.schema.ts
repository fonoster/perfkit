/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { runIdSchema } from "../schemas/primitives.schema.js";

export const collectInputSchema = z.strictObject({
  runId: runIdSchema,
  /** Only wait: never write the report and never delete. */
  wait: z.boolean().default(false),
  out: z.string().min(1, { error: "expected the output directory" }),
  /** How long to wait for the run to end, ms; null waits for ever. */
  timeoutMs: z.number().int().nonnegative().nullable()
});

export type CollectInput = z.input<typeof collectInputSchema>;
