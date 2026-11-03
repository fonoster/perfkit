/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Rounds to 3 decimals. Every number in a report is rounded this way, and
 * every rule compares the rounded value, so a rule's `measured` and
 * `passed` always agree on the page.
 */
export function roundTo(value: number): number {
  return Math.round(value * 1000) / 1000;
}
