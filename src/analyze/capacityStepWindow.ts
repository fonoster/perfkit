/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { TimeWindow } from "./types.js";

/**
 * The window a capacity step is measured over: step `index` (from 0) runs
 * from `startedMs + index × everyMs` for `everyMs`. The first step's window
 * starts `warmupMs` later, so a cold server's first seconds don't count; it
 * still runs its full `everyMs`. `endedMs`, when given, cuts the window short
 * (a ramp that ended early), and the window never starts after it ends.
 */
export function capacityStepWindow(input: {
  startedMs: number;
  index: number;
  everyMs: number;
  warmupMs: number;
  endedMs?: number;
}): TimeWindow {
  const { startedMs, index, everyMs, warmupMs } = input;
  const stepStartMs = startedMs + index * everyMs;
  const stepEndMs = stepStartMs + everyMs;
  const toMs =
    input.endedMs === undefined
      ? stepEndMs
      : Math.min(stepEndMs, input.endedMs);
  const fromMs = Math.min(stepStartMs + (index === 0 ? warmupMs : 0), toMs);
  return { fromMs, toMs };
}
