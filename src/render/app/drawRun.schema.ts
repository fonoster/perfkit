/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const drawRunInputSchema = z.strictObject({
  /** The page's URL path relative to the site root, like `runs/<id>/`. */
  path: z.string()
});

export type DrawRunInput = z.infer<typeof drawRunInputSchema>;
