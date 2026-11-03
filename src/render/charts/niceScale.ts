/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
export interface NiceScale {
  max: number;
  ticks: number[];
}

const STEPS = [1, 2, 2.5, 5, 10];

/**
 * An axis from 0 to a round number at or above `value`, split into `count`
 * equal steps of 1, 2, 2.5 or 5 times a power of ten.
 */
export function niceScale(value: number, count = 4): NiceScale {
  const raw = Math.max(value, Number.EPSILON) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((s) => s * magnitude >= raw) ?? 10) * magnitude;
  return {
    max: step * count,
    ticks: Array.from({ length: count + 1 }, (_, i) =>
      Number((step * i).toPrecision(12))
    )
  };
}
