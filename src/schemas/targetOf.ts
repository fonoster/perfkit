/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { isHelmUut } from "./isHelmUut.js";
import type { UutConfig } from "./perfkitConfig.schema.js";

/** Where a benchmark's unit under test runs. */
export type BenchmarkTarget = "server" | "cluster";

/**
 * The target of a benchmark: `cluster` with `uut.helm`, else `server` (the
 * single droplet, or this machine with --local).
 */
export function targetOf(benchmark: { uut: UutConfig }): BenchmarkTarget {
  return isHelmUut(benchmark.uut) ? "cluster" : "server";
}
