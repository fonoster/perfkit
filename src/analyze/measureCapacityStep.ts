/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Step } from "../schemas/index.js";
import { cpuPctOver } from "./cpuPctOver.js";
import { inWindow } from "./inWindow.js";
import { nearestRank } from "./nearestRank.js";
import { roundTo } from "./roundTo.js";
import { sumStatRows } from "./sumStatRows.js";
import type {
  ProcessSample,
  SippResults,
  TimeWindow,
  UdpSample
} from "./types.js";
import { udpDropsOver } from "./udpDropsOver.js";

/** SIPp above this share of one core means the load generator saturated. */
export const MAX_SIPP_CPU_PCT = 80;
/** Placing less than this share of the offered rate means SIPp fell behind. */
export const MIN_ACHIEVED_RATIO = 0.95;
/** The load generator's SIPp process, as the sampler names it. */
export const SIPP_UAC_PROCESS = "sipp-uac";

export interface StepInput {
  offeredCps: number;
  window: TimeWindow;
  uac: SippResults;
  samples: readonly ProcessSample[];
  udp: readonly UdpSample[];
  uutProcesses: readonly string[];
  unit: string;
}

export interface MeasuredStep {
  step: Step;
  failedPct: number;
  /** Why the step's measurement does not count, or null when it does. */
  invalidReason: string | null;
}

/**
 * Measures one capacity step. Latency counts the calls whose request was
 * sent in the step; attempts, failures and retransmissions come from the
 * stat rows in it. A step is invalid when SIPp used more than 80% of one
 * core, placed less than 95% of the offered rate, or the load generator's
 * UDP drops rose.
 */
export function measureCapacityStep(input: StepInput): MeasuredStep {
  const { window, offeredCps } = input;
  const latencies = input.uac.calls
    .filter((call) => inWindow(call.sentMs, window))
    .map((call) => call.latencyMs);
  const sums = sumStatRows(input.uac.rows, window);
  const seconds = (window.toMs - window.fromMs) / 1000;
  const achievedCps = roundTo(seconds > 0 ? sums.attempted / seconds : 0);
  const failedPct = roundTo(
    sums.attempted > 0 ? (sums.failed / sums.attempted) * 100 : 0
  );
  const sippCpuPct = roundTo(
    cpuPctOver(
      processSamples(input.samples, "loadgen", SIPP_UAC_PROCESS),
      window
    )
  );
  const uutCpuPct = roundTo(
    input.uutProcesses.reduce(
      (sum, name) =>
        sum + cpuPctOver(processSamples(input.samples, "uut", name), window),
      0
    )
  );
  const loadgenUdpDrops = udpDropsOver(input.udp, "loadgen", window);
  const uutUdpDrops = udpDropsOver(input.udp, "uut", window);
  const rate = `${formatNumber(offeredCps)} ${input.unit}/s`;
  const invalidReason =
    sippCpuPct > MAX_SIPP_CPU_PCT
      ? `load generator saturated at ${rate} (SIPp at ${Math.round(sippCpuPct)}% of one core)`
      : achievedCps < offeredCps * MIN_ACHIEVED_RATIO
        ? `load generator fell behind at ${rate} (placed ${formatNumber(achievedCps)} ${input.unit}/s, ${Math.round((achievedCps / offeredCps) * 100)}% of offered)`
        : loadgenUdpDrops > 0
          ? `load generator dropped UDP packets at ${rate} (${formatNumber(loadgenUdpDrops)} buffer errors)`
          : null;
  return {
    failedPct,
    invalidReason,
    step: {
      offeredCps,
      achievedCps,
      calls: sums.attempted,
      p50Ms: roundTo(nearestRank(latencies, 50)),
      p95Ms: roundTo(nearestRank(latencies, 95)),
      p99Ms: roundTo(nearestRank(latencies, 99)),
      failed: sums.failed,
      failuresByReason: sums.failuresByReason,
      retransmissions: sums.retransmissions,
      sippCpuPct,
      uutCpuPct,
      loadgenUdpDrops,
      uutUdpDrops,
      valid: invalidReason === null
    }
  };
}

function processSamples(
  samples: readonly ProcessSample[],
  host: ProcessSample["host"],
  name: string
): ProcessSample[] {
  return samples.filter(
    (sample) => sample.host === host && sample.name === name
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
