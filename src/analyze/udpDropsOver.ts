/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { TimeWindow, UdpSample } from "./types.js";

/**
 * How much one host's UDP drops rose over a window: the sum of the rises
 * between consecutive samples taken in it (both ends included). A counter
 * that went down, after a reboot, adds nothing.
 */
export function udpDropsOver(
  samples: readonly UdpSample[],
  host: UdpSample["host"],
  window: TimeWindow
): number {
  const inside = samples.filter(
    (sample) =>
      sample.host === host &&
      sample.tMs >= window.fromMs &&
      sample.tMs <= window.toMs
  );
  return inside.slice(1).reduce((sum, sample, index) => {
    const rise = sample.drops - (inside[index] as UdpSample).drops;
    return rise > 0 ? sum + rise : sum;
  }, 0);
}
