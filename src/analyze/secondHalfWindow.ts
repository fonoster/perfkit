/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * The second half of a soak's measured window, `[warmupEndMs, endMs]`:
 * memory growth is judged on it, so a heap that climbs while it settles
 * after start-up and then levels off does not count as a leak, while a real
 * leak still shows. An empty window when `endMs` is not after `warmupEndMs`.
 */
export function secondHalfWindow(
  warmupEndMs: number,
  endMs: number
): { fromMs: number; toMs: number } {
  const toMs = Math.max(warmupEndMs, endMs);
  return { fromMs: warmupEndMs + (toMs - warmupEndMs) / 2, toMs };
}
