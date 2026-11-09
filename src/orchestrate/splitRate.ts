/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * Splits a rate over `instances` SIPp processes in whole numbers that add up
 * to the rate: 50 over 8 is six 6s and two 7s, the first instances taking the
 * remainder. SIPp's `-rate_increase` only takes an integer, so a share of
 * 6.25 would keep the instance from starting. A rate that is not a whole
 * number (a soak's `cps: 7.5`) is split evenly, as `-r` takes decimals.
 */
export function splitRate(value: number, instances: number): number[] {
  if (!Number.isInteger(value)) {
    const each = Math.round((value / instances) * 1e4) / 1e4;
    return Array.from({ length: instances }, () => each);
  }
  const base = Math.floor(value / instances);
  const extra = value % instances;
  return Array.from(
    { length: instances },
    (_, i) => base + (i < extra ? 1 : 0)
  );
}
