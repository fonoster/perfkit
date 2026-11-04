/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Resources } from "../schemas/index.js";
import { roundTo } from "./roundTo.js";
import type { ProcessSample } from "./types.js";

/**
 * The report's resources: for each configured process, in perfkit.yaml
 * order, its samples on the unit under test with RSS in MB and CPU % of one
 * core since the previous sample (0 for the first sample and after a pid
 * change).
 */
export function toResources(
  samples: readonly ProcessSample[],
  processNames: readonly string[]
): Resources {
  return {
    processes: processNames.map((name) => {
      const own = samples.filter(
        (sample) => sample.host === "uut" && sample.name === name
      );
      return {
        name,
        samples: own.map((sample, index) => ({
          t: sample.t,
          rssMB: roundTo(sample.rssKB / 1024),
          cpuPct: roundTo(cpuSincePrevious(sample, own[index - 1])),
          fds: sample.fds,
          pid: sample.pid
        }))
      };
    })
  };
}

function cpuSincePrevious(
  sample: ProcessSample,
  previous: ProcessSample | undefined
): number {
  if (previous === undefined || previous.pid !== sample.pid) return 0;
  const seconds = (sample.tMs - previous.tMs) / 1000;
  const ticks = sample.cpuTicks - previous.cpuTicks;
  if (seconds <= 0 || ticks < 0) return 0;
  return (ticks / sample.clkTck / seconds) * 100;
}
