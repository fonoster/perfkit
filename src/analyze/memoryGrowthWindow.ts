/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * The window memory growth is judged on: from the end of the warm-up plus
 * the settle period, while the heap settles after start-up, to the end of
 * the load (samples after it, while the load winds down, don't count). An
 * empty window at `toMs` when the load ended before the settle period did.
 */
export function memoryGrowthWindow(input: {
  warmupEndMs: number;
  settleS: number;
  loadEndMs: number;
}): { fromMs: number; toMs: number } {
  const fromMs = input.warmupEndMs + input.settleS * 1000;
  return { fromMs: Math.min(fromMs, input.loadEndMs), toMs: input.loadEndMs };
}
