/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { TimeWindow } from "./types.js";

/** Whether a time, ms since the epoch, is in the window: from <= t < to. */
export function inWindow(tMs: number, window: TimeWindow): boolean {
  return tMs >= window.fromMs && tMs < window.toMs;
}
