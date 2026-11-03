/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { linePath } from "./linePath.js";

const W = 180;
const H = 40;
const PAD = 5;

/**
 * A small line through the values, oldest first, with a dot on the newest.
 * Decorative: the caller writes the values in text next to it.
 */
export function renderSparkline(values: ReadonlyArray<number>): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, i): [number, number] => [
    PAD + (i / Math.max(values.length - 1, 1)) * (W - 2 * PAD),
    H - PAD - ((value - min) / span) * (H - 2 * PAD)
  ]);
  const last = points[points.length - 1] ?? [W - PAD, PAD];
  return `<svg class="sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path d="${linePath(points)}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4"/></svg>`;
}
