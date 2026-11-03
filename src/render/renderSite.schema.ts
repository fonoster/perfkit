/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const renderSiteInputSchema = z.strictObject({
  report: z.string().min(1, { error: "report must not be empty" }),
  history: z.string().min(1, { error: "history must not be empty" }).optional(),
  out: z.string().min(1, { error: "out must not be empty" })
});

export type RenderSiteInput = z.infer<typeof renderSiteInputSchema>;
