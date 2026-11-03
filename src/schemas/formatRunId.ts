/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Builds a run id: `<startedAt as YYYYMMDDTHHMMSSZ>-<first 7 of commit>`, for
 * example `20261103T141210Z-bd3254a` for a run started at
 * 2026-11-03T14:12:10Z on commit bd3254a4f3e1. Fractional seconds are dropped.
 */
export function formatRunId(startedAt: string, commit: string): string {
  const stamp = new Date(startedAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
  return `${stamp}-${commit.slice(0, 7)}`;
}
