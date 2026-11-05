/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { runStateSchema } from "./runState.schema.js";

export const startRunInputSchema = z.strictObject({
  ...runStateSchema.pick({
    runId: true,
    mode: true,
    root: true,
    namePrefix: true,
    perfkitVersion: true,
    command: true,
    plan: true,
    config: true,
    logoSvg: true,
    faviconSvg: true,
    hosts: true,
    live: true
  }).shape,
  /** The directory of perfkit.yaml. */
  projectDir: z.string().min(1, { error: "expected the project directory" }),
  /** The run's --out, left out of the project copy. */
  out: z.string().min(1, { error: "expected the output directory" }),
  /** The run-only private key for the agent; DigitalOcean runs only. */
  agentKey: z.string().optional(),
  /**
   * NGROK_AUTHTOKEN for the agent's tunnel, DigitalOcean runs only. It goes
   * into the agent container's environment, never into run.json or a log.
   */
  ngrokToken: z.string().min(1).optional()
});

export type StartRunInput = z.infer<typeof startRunInputSchema>;
