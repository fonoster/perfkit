/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const validateFileInputSchema = z.strictObject({
  file: z.string().min(1, { error: "file must not be empty" })
});

export type ValidateFileInput = z.infer<typeof validateFileInputSchema>;
