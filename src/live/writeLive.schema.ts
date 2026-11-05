/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

/** writeLive takes no options: it writes the run's live.json now. */
export const writeLiveInputSchema = z.strictObject({});

export type WriteLiveInput = z.infer<typeof writeLiveInputSchema>;
