/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The v1 formats: perfkit.yaml, report.json and runs.json. Later commands
 * import these schemas and types; their shapes are the compatibility surface.
 */
export { formatRunId } from "./formatRunId.js";
export {
  benchmarkConfigSchema,
  capacityBenchmarkConfigSchema,
  perfkitConfigSchema,
  relativePathSchema,
  soakBenchmarkConfigSchema,
  type BenchmarkConfig,
  type CapacityBenchmarkConfig,
  type PerfkitConfig,
  type PerfkitConfigInput,
  type SoakBenchmarkConfig
} from "./perfkitConfig.schema.js";
export {
  BENCHMARK_KINDS,
  CAPACITY_RULE_IDS,
  durationSchema,
  kindSchema,
  SCHEMA_IDS,
  SOAK_RULE_IDS,
  VERDICTS,
  verdictSchema,
  verdictSummarySchema,
  type BenchmarkKind,
  type SchemaId,
  type Verdict,
  type VerdictSummary
} from "./primitives.schema.js";
export {
  benchmarkResultSchema,
  capacityBenchmarkResultSchema,
  capacityHeadlineSchema,
  capacityRuleSchema,
  hopsSchema,
  reasonSchema,
  reportSchema,
  resourcesSchema,
  seriesSchema,
  soakBenchmarkResultSchema,
  soakHeadlineSchema,
  soakRuleSchema,
  stepSchema,
  stoppedBySchema,
  type BenchmarkResult,
  type CapacityBenchmarkResult,
  type CapacityHeadline,
  type CapacityRule,
  type Hops,
  type Report,
  type Resources,
  type Series,
  type SoakBenchmarkResult,
  type SoakHeadline,
  type SoakRule,
  type Step,
  type StoppedBy
} from "./report.schema.js";
export {
  runBenchmarkSchema,
  runEntrySchema,
  runsSchema,
  type RunBenchmark,
  type RunEntry,
  type Runs
} from "./runs.schema.js";
export { toJsonSchemaFiles } from "./toJsonSchemaFiles.js";
