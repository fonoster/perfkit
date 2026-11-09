/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Turns a benchmark's raw results (SIPp traces, sampler, UDP counters and
 * spans) into its report.json v1 entry.
 */
export {
  type AnalyzeCapacityInput,
  analyzeCapacityInputSchema
} from "./analyzeCapacity.schema.js";
export {
  type AnalyzeSoakInput,
  analyzeSoakInputSchema
} from "./analyzeSoak.schema.js";
export { computeHops } from "./computeHops.js";
export { countRestarts } from "./countRestarts.js";
export { capacityStepWindow } from "./capacityStepWindow.js";
export { cpuPctOver } from "./cpuPctOver.js";
export { createAnalyzeCapacity } from "./createAnalyzeCapacity.js";
export {
  createAnalyzeSoak,
  MIN_COVERAGE,
  NO_CALLS_REASON,
  noResponseTimesReason,
  TOO_LITTLE_DATA_REASON
} from "./createAnalyzeSoak.js";
export { createNodeAnalyzeDeps } from "./createNodeAnalyzeDeps.js";
export { durationToSeconds } from "./durationToSeconds.js";
export { leastSquaresSlope } from "./leastSquaresSlope.js";
export { memoryGrowthMBPerHour } from "./memoryGrowthMBPerHour.js";
export {
  MAX_SIPP_CPU_PCT,
  measureCapacityStep,
  MIN_ACHIEVED_RATIO,
  SIPP_UAC_PROCESS,
  uacProcessName,
  uacProcessNames
} from "./measureCapacityStep.js";
export { nearestRank } from "./nearestRank.js";
export { parseOtlpSpanLines, parseOtlpSpans } from "./parseOtlpSpans.js";
export { parseRttCsv } from "./parseRttCsv.js";
export { parseSamplerJsonl } from "./parseSamplerJsonl.js";
export { parseStatCsv } from "./parseStatCsv.js";
export { parseUdpJsonl } from "./parseUdpJsonl.js";
export {
  capacityMetaSchema,
  samplerLineSchema,
  soakMetaSchema,
  udpLineSchema,
  type CapacityMeta,
  type SoakMeta
} from "./rawResults.schema.js";
export { MEASURED_RTD, readSippResults } from "./readSippResults.js";
export { sumStatRows, type StatSums } from "./sumStatRows.js";
export { toResources } from "./toResources.js";
export type {
  AnalyzeDeps,
  Call,
  ProcessSample,
  RttRow,
  SippResults,
  Span,
  StatRow,
  StatTrace,
  TimeWindow,
  UdpSample
} from "./types.js";
