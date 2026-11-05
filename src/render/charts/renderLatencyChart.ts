/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Step } from "../../schemas/index.js";
import { formatMs, formatNumber, formatPct, formatRate } from "../format.js";
import { esc } from "../html.js";
import { linePath } from "./linePath.js";
import { niceScale } from "./niceScale.js";

export interface LatencyChartInput {
  steps: ReadonlyArray<Step>;
  /** What one request is, plural: `calls`, `messages`. */
  unit: string;
  /** The p99 rule's limit, drawn as a dashed line. */
  thresholdMs: number | null;
  /** The capacity limit, marked on the chart; null when there is none. */
  limit: { cps: number; lowerBound: boolean; p99Ms: number | null } | null;
  /** The run stopped early: the chart shows what was measured. */
  partial: boolean;
  /**
   * A ramp in progress (the live page): the x axis spans the whole ramp,
   * the step offered now is marked and the steps not run yet are shaded.
   * Left out, the chart is the final report's, unchanged.
   */
  live?: { maxCps: number; nowCps: number };
}

const W = 820;
const H = 340;
const LEFT = 56;
const RIGHT = 796;
const TOP = 24;
const BOTTOM = 304;

const SERIES = [
  { key: "p99Ms", label: "p99", className: "s-p99" },
  { key: "p95Ms", label: "p95", className: "s-p95" },
  { key: "p50Ms", label: "p50", className: "s-p50" }
] as const;

/**
 * The capacity chart: p50, p95 and p99 request-to-200 latency against the
 * offered rate, with the p99 limit, the capacity limit and the area over it.
 * The same numbers follow as a table, for readers who cannot see the chart.
 */
export function renderLatencyChart(input: LatencyChartInput): string {
  const { steps, thresholdMs, limit } = input;
  const { live } = input;
  const maxCps = Math.max(
    ...steps.map((s) => s.offeredCps),
    limit?.cps ?? 0,
    live?.maxCps ?? 0
  );
  const maxMs = Math.max(
    ...steps.map((s) => s.p99Ms),
    thresholdMs ?? 0,
    live ? 1 : 0
  );
  const xScale = niceScale(maxCps);
  const yScale = niceScale(maxMs * 1.05);
  const sx = (cps: number) => LEFT + (cps / xScale.max) * (RIGHT - LEFT);
  const sy = (ms: number) => BOTTOM - (ms / yScale.max) * (BOTTOM - TOP);

  const grid = yScale.ticks
    .map(
      (tick) =>
        `<line class="grid" x1="${LEFT}" x2="${RIGHT}" y1="${sy(tick).toFixed(1)}" y2="${sy(tick).toFixed(1)}"/><text class="tick" x="${LEFT - 10}" y="${(sy(tick) + 4).toFixed(1)}" text-anchor="end">${formatNumber(tick)}</text>`
    )
    .join("");
  const xTicks = xScale.ticks
    .map(
      (tick) =>
        `<text class="tick" x="${sx(tick).toFixed(1)}" y="${BOTTOM + 20}" text-anchor="middle">${formatNumber(tick)}</text>`
    )
    .join("");

  const overLimit =
    limit && !limit.lowerBound
      ? `<rect class="over-limit" x="${sx(limit.cps).toFixed(1)}" y="${TOP}" width="${(RIGHT - sx(limit.cps)).toFixed(1)}" height="${BOTTOM - TOP}"/><text class="over-limit-label" x="${RIGHT - 8}" y="${TOP + 16}" text-anchor="end">over the limit</text>`
      : "";

  const threshold =
    thresholdMs === null
      ? ""
      : `<line class="threshold" x1="${LEFT}" x2="${RIGHT}" y1="${sy(thresholdMs).toFixed(1)}" y2="${sy(thresholdMs).toFixed(1)}"/><text class="threshold-label" x="${RIGHT - 8}" y="${(sy(thresholdMs) - 8).toFixed(1)}" text-anchor="end">p99 limit ${esc(formatMs(thresholdMs))}</text>`;

  const lines = SERIES.map(
    (series) =>
      `<path class="line ${series.className}" d="${linePath(steps.map((s) => [sx(s.offeredCps), sy(s[series.key])]))}"/>${
        steps.length < 3
          ? steps
              .map(
                (s) =>
                  `<circle class="point ${series.className}" cx="${sx(s.offeredCps).toFixed(1)}" cy="${sy(s[series.key]).toFixed(1)}" r="3.5"/>`
              )
              .join("")
          : ""
      }`
  ).join("");

  const limitText = limit
    ? `${limit.lowerBound ? "at least" : "limit"} ${formatRate(limit.cps, input.unit)}`
    : "";
  const limitMarker = limit
    ? `<line class="limit-line" x1="${sx(limit.cps).toFixed(1)}" x2="${sx(limit.cps).toFixed(1)}" y1="${TOP}" y2="${BOTTOM}"/>${
        limit.p99Ms === null
          ? ""
          : `<circle class="limit-dot" cx="${sx(limit.cps).toFixed(1)}" cy="${sy(limit.p99Ms).toFixed(1)}" r="5.5"/>`
      }<rect class="limit-tag" x="${(sx(limit.cps) - 8 - limitText.length * 7.4 - 16).toFixed(1)}" y="${TOP + 8}" width="${(limitText.length * 7.4 + 16).toFixed(1)}" height="22" rx="4"/><text class="limit-tag-text" x="${(sx(limit.cps) - 16).toFixed(1)}" y="${TOP + 23}" text-anchor="end">${esc(limitText)}</text>`
    : "";

  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Latency as load rises: p50, p95 and p99 request to 200 OK latency in ms against offered ${esc(input.unit)}/s.${limit ? ` Marked: ${esc(limitText)}.` : ""} The numbers are in the table under the chart.">
<text class="axis-unit" x="0" y="12">ms</text>${grid}
<line class="axis" x1="${LEFT}" x2="${RIGHT}" y1="${BOTTOM}" y2="${BOTTOM}"/>${xTicks}
<text class="axis-unit" x="${(LEFT + RIGHT) / 2}" y="${H - 2}" text-anchor="middle">offered ${esc(input.unit)}/s</text>
${live ? liveRegion(live, steps, sx) : ""}${overLimit}${threshold}${lines}${limitMarker}${live ? liveMarker(live, steps, input.unit, sx, sy) : ""}
</svg>`;

  const legend =
    SERIES.map(
      (s) =>
        `<li><span class="swatch ${s.className}" aria-hidden="true"></span>${s.label}</li>`
    ).join("") +
    (live
      ? '<li class="legend-live"><span class="live-dot" aria-hidden="true"></span>live</li>'
      : "");

  const rows = steps
    .map(
      (s) =>
        `<tr><td>${formatNumber(s.offeredCps)}</td><td>${formatNumber(s.achievedCps)}</td><td>${formatNumber(s.p50Ms)}</td><td>${formatNumber(s.p95Ms)}</td><td>${formatNumber(s.p99Ms)}</td><td>${formatPct(s.calls === 0 ? 0 : (s.failed / s.calls) * 100)}</td><td>${s.valid ? "yes" : "no"}</td></tr>`
    )
    .join("");

  return `<figure class="card card-surface chart-card">
<div class="chart-head">
<div><h3 class="card-title">Latency as load rises</h3><p class="card-sub">request to 200 OK, by offered rate</p></div>
<div class="chart-head-side">${input.partial ? '<span class="tag">Partial</span>' : ""}<ul class="legend">${legend}</ul></div>
</div>
<div class="scroll-x chart-scroll" tabindex="0" role="group" aria-label="Latency chart, scrolls sideways">${svg}</div>
<p class="scroll-hint" aria-hidden="true">&larr; chart scrolls sideways &rarr;</p>
<details class="chart-data"><summary>Numbers behind this chart</summary>
<div class="scroll-x"><table class="data">
<thead><tr><th scope="col">Offered ${esc(input.unit)}/s</th><th scope="col">Achieved ${esc(input.unit)}/s</th><th scope="col">p50 ms</th><th scope="col">p95 ms</th><th scope="col">p99 ms</th><th scope="col">Failed</th><th scope="col">Valid step</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
</details>
</figure>`;
}

/** The steps not run yet, shaded from the step offered now to the end. */
function liveRegion(
  live: { maxCps: number; nowCps: number },
  steps: ReadonlyArray<Step>,
  sx: (cps: number) => number
): string {
  const from = sx(Math.max(live.nowCps, steps.at(-1)?.offeredCps ?? 0));
  if (from >= RIGHT - 1) return "";
  return `<rect class="not-run" x="${from.toFixed(1)}" y="${TOP}" width="${(RIGHT - from).toFixed(1)}" height="${BOTTOM - TOP}"/><text class="not-run-label" x="${((from + RIGHT) / 2).toFixed(1)}" y="${((TOP + BOTTOM) / 2).toFixed(1)}" text-anchor="middle">steps not run yet</text>`;
}

/** "now <rate>": a tag over the last measured p99, or the axis at first. */
function liveMarker(
  live: { maxCps: number; nowCps: number },
  steps: ReadonlyArray<Step>,
  unit: string,
  sx: (cps: number) => number,
  sy: (ms: number) => number
): string {
  const last = steps.at(-1);
  const x = sx(last?.offeredCps ?? live.nowCps);
  const y = last ? sy(last.p99Ms) : BOTTOM;
  const text = `now ${formatRate(live.nowCps, unit)}`;
  const width = text.length * 7.4 + 16;
  const tagX = Math.min(Math.max(x - width / 2, LEFT), RIGHT - width);
  const tagY = Math.max(y - 44, TOP);
  return `${last ? `<circle class="now-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/><circle class="now-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5"/>` : ""}<rect class="now-tag" x="${tagX.toFixed(1)}" y="${tagY.toFixed(1)}" width="${width.toFixed(1)}" height="22" rx="4"/><text class="now-tag-text" x="${(tagX + width / 2).toFixed(1)}" y="${(tagY + 15).toFixed(1)}" text-anchor="middle">${esc(text)}</text>`;
}
