/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 } as const;

/** Milliseconds in a perfkit duration like `30s`, `10m` or `9h`. */
export function parseDuration(duration: string): number {
  const match = /^(\d+)([smh])$/.exec(duration);
  if (!match) throw new Error(`expected a duration like 30s, 10m or 6h`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
