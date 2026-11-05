/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** `0:52`, `12:05`: hours and minutes of a span in seconds. */
export function formatClock(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
