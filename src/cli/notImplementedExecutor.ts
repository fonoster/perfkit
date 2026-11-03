/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { BenchmarkExecutor } from "./types.js";

/**
 * The benchmark executor until the orchestration lands: it throws, so a real
 * `run` provisions, fails with exit 3, and tears everything down.
 */
export const notImplementedExecutor: BenchmarkExecutor = async () => {
  throw new Error("benchmarks are not implemented yet");
};
