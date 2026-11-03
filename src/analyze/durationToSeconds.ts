/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const UNIT_S = { s: 1, m: 60, h: 3600 } as const;

/** A perfkit.yaml duration, `30s`, `10m` or `6h`, in seconds. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smh])$/.exec(duration);
  if (!match) throw new Error(`invalid duration: ${duration}`);
  return Number(match[1]) * UNIT_S[match[2] as keyof typeof UNIT_S];
}
