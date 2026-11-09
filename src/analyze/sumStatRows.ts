/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { inWindow } from "./inWindow.js";
import type { StatRow, TimeWindow } from "./types.js";

export interface StatSums {
  /** OutgoingCall(P): calls SIPp started. */
  attempted: number;
  /** FailedCall(P). */
  failed: number;
  /** Each nonzero Failed<Reason>(P) but FailedCall(P), by reason. */
  failuresByReason: Record<string, number>;
  /** Retransmissions(P). */
  retransmissions: number;
  /**
   * The highest CurrentCall; with several SIPp processes, the sum of each
   * one's highest.
   */
  maxCurrentCalls: number;
}

/**
 * Sums SIPp's periodic (P) counters over the stat rows that fall in a window.
 * A row covers the time since the previous row, and counts in the window
 * that holds the middle of that period: rows are written every 10 s and
 * steps rarely line up with them, so a row goes where most of its calls are.
 */
export function sumStatRows(
  rows: readonly StatRow[],
  window: TimeWindow
): StatSums {
  const inside = rows.filter((row) =>
    inWindow((row.periodStartMs + row.tMs) / 2, window)
  );
  const sum = (name: string) =>
    inside.reduce((total, row) => total + (row.counters[name] ?? 0), 0);
  const reasons = [
    ...new Set(
      inside.flatMap((row) =>
        Object.keys(row.counters).filter(
          (name) => /^Failed\w+\(P\)$/.test(name) && name !== "FailedCall(P)"
        )
      )
    )
  ];
  const failuresByReason = Object.fromEntries(
    reasons
      .map((name) => [name.replace(/\(P\)$/, ""), sum(name)] as const)
      .filter(([, total]) => total > 0)
  );
  return {
    attempted: sum("OutgoingCall(P)"),
    failed: sum("FailedCall(P)"),
    failuresByReason,
    retransmissions: sum("Retransmissions(P)"),
    maxCurrentCalls: maxCurrentCalls(inside)
  };
}

function maxCurrentCalls(rows: readonly StatRow[]): number {
  const perProcess = rows.reduce((max, row) => {
    const key = row.pid ?? "";
    return max.set(
      key,
      Math.max(max.get(key) ?? 0, row.counters.CurrentCall ?? 0)
    );
  }, new Map<string, number>());
  return [...perProcess.values()].reduce((sum, value) => sum + value, 0);
}
