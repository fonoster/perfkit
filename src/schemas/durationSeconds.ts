/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const UNIT_S = { s: 1, m: 60, h: 3600 } as const;

/**
 * The seconds in a perfkit duration (`30s`, `5m`, `2h`), or 0 when it is not
 * one; the schema has already rejected a bad duration by then.
 */
export function durationSeconds(duration: string): number {
  const match = /^(\d+)([smh])$/.exec(duration);
  return match ? Number(match[1]) * UNIT_S[match[2] as keyof typeof UNIT_S] : 0;
}
