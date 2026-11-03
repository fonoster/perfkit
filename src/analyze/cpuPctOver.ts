/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { ProcessSample, TimeWindow } from "./types.js";

/**
 * A process's CPU over a window, % of one core: Δ cpuTicks / clkTck / Δ
 * seconds × 100, over the samples taken in the window (both ends included).
 * A pair of samples with different pids, or whose ticks went down, adds no
 * CPU time. 0 with fewer than two samples.
 */
export function cpuPctOver(
  samples: readonly ProcessSample[],
  window: TimeWindow
): number {
  const inside = samples.filter(
    ({ tMs }) => tMs >= window.fromMs && tMs <= window.toMs
  );
  const first = inside[0];
  const last = inside.at(-1);
  if (first === undefined || last === undefined || last.tMs <= first.tMs) {
    return 0;
  }
  const cpuSeconds = inside.slice(1).reduce((sum, sample, index) => {
    const previous = inside[index] as ProcessSample;
    const ticks = sample.cpuTicks - previous.cpuTicks;
    if (sample.pid !== previous.pid || ticks < 0) return sum;
    return sum + ticks / sample.clkTck;
  }, 0);
  return (cpuSeconds / ((last.tMs - first.tMs) / 1000)) * 100;
}
