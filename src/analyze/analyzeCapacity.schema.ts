/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { capacityBenchmarkConfigSchema } from "../schemas/index.js";

export const analyzeCapacityInputSchema = z.strictObject({
  /** The benchmark's raw results directory. */
  rawDir: z.string().min(1, { error: "expected the raw results directory" }),
  /** The benchmark as perfkit.yaml defines it. */
  benchmark: capacityBenchmarkConfigSchema
});

export type AnalyzeCapacityInput = z.infer<typeof analyzeCapacityInputSchema>;
