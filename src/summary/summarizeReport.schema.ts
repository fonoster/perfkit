/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const summarizeReportInputSchema = z.strictObject({
  report: z.string().min(1, { error: "report must not be empty" })
});

export type SummarizeReportInput = z.infer<typeof summarizeReportInputSchema>;
