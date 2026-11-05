/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** The snapshot counts as stale after this, and the link as lost after that. */
export const STALE_AFTER_MS = 60 * 1000;
export const LOST_AFTER_MS = 3 * 60 * 1000;

/**
 * The banner's "updated N s ago": warning-coloured once the snapshot is a
 * minute old, and "connection lost, retrying" once the last poll failed or
 * the snapshot is three minutes old.
 */
export function formatUpdated(
  updatedAt: string,
  nowMs: number,
  connection: "ok" | "lost"
): { text: string; tone: "ok" | "stale" | "lost" } {
  const ageMs = Math.max(0, nowMs - Date.parse(updatedAt));
  if (connection === "lost" || ageMs >= LOST_AFTER_MS) {
    return { text: "connection lost, retrying", tone: "lost" };
  }
  const seconds = Math.round(ageMs / 1000);
  const text =
    seconds < 60
      ? `updated ${seconds} s ago`
      : `updated ${Math.floor(seconds / 60)} min ago`;
  return { text, tone: ageMs >= STALE_AFTER_MS ? "stale" : "ok" };
}
