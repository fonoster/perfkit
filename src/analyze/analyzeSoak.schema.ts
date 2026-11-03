/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { soakBenchmarkConfigSchema } from "../schemas/index.js";

export const analyzeSoakInputSchema = z.strictObject({
  /** The benchmark's raw results directory. */
  rawDir: z.string().min(1, { error: "expected the raw results directory" }),
  /** The benchmark as perfkit.yaml defines it. */
  benchmark: soakBenchmarkConfigSchema
});

export type AnalyzeSoakInput = z.infer<typeof analyzeSoakInputSchema>;
