/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

/**
 * `--report` adds a run to the site; `--config` alone writes the site from
 * perfkit.yaml with the history as it is (none: no runs yet).
 */
export const renderSiteInputSchema = z
  .strictObject({
    report: z.string().min(1, { error: "report must not be empty" }).optional(),
    config: z.string().min(1, { error: "config must not be empty" }).optional(),
    history: z
      .string()
      .min(1, { error: "history must not be empty" })
      .optional(),
    out: z.string().min(1, { error: "out must not be empty" })
  })
  .refine(
    (input) => (input.report === undefined) !== (input.config === undefined),
    {
      error: "expected --report or --config, not both and not neither",
      path: ["report"]
    }
  );

export type RenderSiteInput = z.infer<typeof renderSiteInputSchema>;
