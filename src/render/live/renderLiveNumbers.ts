/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import {
  formatCount,
  formatDuration,
  formatMs,
  formatNumber,
  formatPct
} from "../format.js";
import { esc } from "../html.js";
import { formatClock } from "./formatClock.js";
import type { LiveViewContext } from "./types.js";

type Cell = [value: string, label: string, sub: string];

/**
 * The live numbers: for the benchmark running now, the rate offered and
 * placed, p99 of the last step (a soak: the calls placed), failed so far;
 * and always how long the run has gone and how long it has to go.
 */
export function renderLiveNumbers(ctx: LiveViewContext): string {
  const { live, nowMs } = ctx;
  const running = live.benchmarks.find((b) => b.state === "running");
  const endMs = live.estimatedEndAt ? Date.parse(live.estimatedEndAt) : null;
  const elapsedS =
    ((live.status === "running" ? nowMs : Date.parse(live.updatedAt)) -
      Date.parse(live.startedAt)) /
    1000;
  const elapsed: Cell = [
    formatClock(elapsedS),
    live.status === "running"
      ? "hours:minutes into the run"
      : "hours:minutes the run took",
    endMs !== null && live.status === "running"
      ? `about ${formatDuration(Math.max(60, (endMs - nowMs) / 1000))} to go`
      : "the run has ended"
  ];
  const cells: Cell[] = [];
  if (running?.kind === "capacity" && running.current) {
    const last = running.points.at(-1);
    cells.push(
      [
        formatNumber(running.current.offeredCps),
        `${running.unit}/s offered now, ${running.title}`,
        last
          ? `placed ${formatNumber(last.achievedCps)}/s · ${Math.round((last.achievedCps / Math.max(last.offeredCps, 1)) * 100)}% (last step)`
          : "first step in progress"
      ],
      [
        last ? formatMs(last.p99Ms) : "--",
        "p99 latency, last step",
        `limit ${formatMs(running.thresholds.p99LatencyMs)}`
      ],
      [
        last ? formatPct(last.failedPct) : "--",
        `failed ${running.unit}, last step`,
        `limit ${formatPct(running.thresholds.failedCallsPct)}`
      ]
    );
  } else if (running?.kind === "soak" && running.loadStartedAt !== null) {
    const { placed, failed } = running.calls;
    cells.push(
      [
        formatNumber(running.cps),
        `${running.unit}/s offered now, ${running.title}`,
        running.elapsedS < running.warmupS
          ? "warm-up, not measured"
          : "steady rate"
      ],
      [
        formatCount(placed),
        `${running.unit} placed so far`,
        "since the load started"
      ],
      [
        formatPct(placed > 0 ? (failed / placed) * 100 : 0),
        `failed ${running.unit} so far`,
        `limit ${formatPct(running.thresholds.failedCallsPct)}`
      ]
    );
  }
  const all = [...cells, elapsed];
  return `<section class="headline" aria-label="Live numbers">
<div class="wrap">
<div class="stats stats-${all.length}">${all
    .map(
      ([value, label, sub]) =>
        `<div class="stat"><p class="stat-value">${esc(value)}</p><p class="stat-label">${esc(label)}</p><p class="stat-sub">${esc(sub)}</p></div>`
    )
    .join("")}</div>
</div>
</section>`;
}
