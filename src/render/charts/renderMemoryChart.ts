/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Resources } from "../../schemas/index.js";
import { formatDuration, formatGrowth, formatNumber } from "../format.js";
import { esc } from "../html.js";
import { linePath } from "./linePath.js";
import { niceScale } from "./niceScale.js";

export interface MemoryChartInput {
  processes: Resources["processes"];
  /** The benchmark's duration, warm-up included; the chart's x axis. */
  durationS: number;
  /** Shaded and labeled as warm-up; null when unknown. */
  warmupS: number | null;
  /** Each process's measured growth after warm-up, in MB/h. */
  growth: ReadonlyMap<string, number>;
  /** The run stopped early: the chart shows what was measured. */
  partial: boolean;
}

const W = 820;
const H = 320;
const LEFT = 56;
const RIGHT = 796;
const TOP = 24;
const BOTTOM = 284;
const LABEL_GAP = 16;
const TICK_STEPS_S = [300, 900, 1800, 3600, 7200, 10800, 21600, 43200];
const COLORS = ["s-1", "s-2", "s-3", "s-4", "s-5"];

/**
 * Memory per process over the soak, warm-up shaded, each line labeled with
 * its process and growth. A table with each process's first, last and peak
 * memory follows, for readers who cannot see the chart.
 */
export function renderMemoryChart(input: MemoryChartInput): string {
  const withSamples = input.processes.filter((p) => p.samples.length > 0);
  const times = withSamples.flatMap((p) =>
    p.samples.map((s) => Date.parse(s.t))
  );
  const end = Math.max(...times);
  const start = Math.min(end - input.durationS * 1000, ...times);
  const domainS = Math.max((end - start) / 1000, input.durationS, 1);
  const maxMB = Math.max(
    ...withSamples.flatMap((p) => p.samples.map((s) => s.rssMB))
  );
  const yScale = niceScale(maxMB * 1.08);
  const step =
    TICK_STEPS_S.find((s) => domainS / s <= 7) ??
    TICK_STEPS_S[TICK_STEPS_S.length - 1] ??
    3600;
  const xTicks = Array.from(
    { length: Math.floor(domainS / step) + 1 },
    (_, i) => i * step
  );
  const sx = (seconds: number) => LEFT + (seconds / domainS) * (RIGHT - LEFT);
  const sy = (mb: number) => BOTTOM - (mb / yScale.max) * (BOTTOM - TOP);
  const at = (t: string) => (Date.parse(t) - start) / 1000;

  const grid = yScale.ticks
    .map(
      (tick) =>
        `<line class="grid" x1="${LEFT}" x2="${RIGHT}" y1="${sy(tick).toFixed(1)}" y2="${sy(tick).toFixed(1)}"/><text class="tick" x="${LEFT - 10}" y="${(sy(tick) + 4).toFixed(1)}" text-anchor="end">${formatNumber(tick, 0)}</text>`
    )
    .join("");
  const ticks = xTicks
    .map(
      (tick) =>
        `<text class="tick" x="${sx(tick).toFixed(1)}" y="${BOTTOM + 20}" text-anchor="middle">${esc(tickLabel(tick, step))}</text>`
    )
    .join("");

  const warmup =
    input.warmupS && input.warmupS > 0
      ? `<rect class="warmup" x="${LEFT}" y="${TOP}" width="${(sx(Math.min(input.warmupS, domainS)) - LEFT).toFixed(1)}" height="${BOTTOM - TOP}"/><text class="warmup-label" x="${LEFT + 6}" y="${TOP + 14}">warm-up</text>`
      : "";

  const lines = withSamples
    .map((p, i) => {
      const points = p.samples.map((s): [number, number] => [
        sx(at(s.t)),
        sy(s.rssMB)
      ]);
      return `<path class="line ${COLORS[i % COLORS.length]}" d="${linePath(points)}"/>`;
    })
    .join("");

  const labels = spreadLabels(
    withSamples.map((p, i) => {
      const last = p.samples[p.samples.length - 1];
      const growth = input.growth.get(p.name);
      return {
        text:
          growth === undefined ? p.name : `${p.name} ${formatGrowth(growth)}`,
        x: last ? sx(at(last.t)) - 4 : RIGHT,
        y: last ? sy(last.rssMB) - 8 : TOP,
        color: COLORS[i % COLORS.length] ?? "s-1"
      };
    })
  )
    .map(
      (l) =>
        `<text class="line-label ${l.color}" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="end">${esc(l.text)}</text>`
    )
    .join("");

  const partialMark = input.partial
    ? `<text class="partial-label" x="${RIGHT - 8}" y="${TOP + 14}" text-anchor="end">Partial</text>`
    : "";

  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Memory per process: resident memory in MB over ${esc(formatDuration(input.durationS))}${input.warmupS ? `, warm-up of ${esc(formatDuration(input.warmupS))} shaded` : ""}. The numbers are in the table under the chart.">
<text class="axis-unit" x="0" y="12">MB</text>${grid}
<line class="axis" x1="${LEFT}" x2="${RIGHT}" y1="${BOTTOM}" y2="${BOTTOM}"/>${ticks}
${warmup}${lines}${labels}${partialMark}
</svg>`;

  const legend = withSamples
    .map(
      (p, i) =>
        `<li><span class="swatch ${COLORS[i % COLORS.length]}" aria-hidden="true"></span>${esc(p.name)}</li>`
    )
    .join("");

  const rows = withSamples
    .map((p) => {
      const first = p.samples[0];
      const last = p.samples[p.samples.length - 1];
      const peak = Math.max(...p.samples.map((s) => s.rssMB));
      const growth = input.growth.get(p.name);
      return `<tr><th scope="row">${esc(p.name)}</th><td>${first ? formatNumber(first.rssMB) : "--"}</td><td>${last ? formatNumber(last.rssMB) : "--"}</td><td>${formatNumber(peak)}</td><td>${growth === undefined ? "not evaluated" : esc(formatGrowth(growth))}</td><td>${p.samples.length}</td></tr>`;
    })
    .join("");

  return `<figure class="card card-surface chart-card">
<div class="chart-head">
<div><h3 class="card-title">Memory per process</h3><p class="card-sub">Resident memory per process in the container</p></div>
<div class="chart-head-side">${input.partial ? '<span class="tag">Partial</span>' : ""}<ul class="legend">${legend}</ul></div>
</div>
<div class="scroll-x chart-scroll" tabindex="0" role="group" aria-label="Memory chart, scrolls sideways">${svg}</div>
<p class="scroll-hint" aria-hidden="true">&larr; chart scrolls sideways &rarr;</p>
<details class="chart-data"><summary>Numbers behind this chart</summary>
<div class="scroll-x"><table class="data">
<thead><tr><th scope="col">Process</th><th scope="col">First MB</th><th scope="col">Last MB</th><th scope="col">Peak MB</th><th scope="col">Growth after warm-up</th><th scope="col">Samples</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
</details>
</figure>`;
}

function tickLabel(seconds: number, step: number): string {
  if (seconds === 0) return step >= 3600 ? "0 h" : "0";
  return step >= 3600 ? `${seconds / 3600} h` : formatDuration(seconds);
}

interface Label {
  text: string;
  x: number;
  y: number;
  color: string;
}

/** Moves labels apart vertically so no two overlap. */
function spreadLabels(labels: Label[]): Label[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  return sorted.reduce<Label[]>((placed, label) => {
    const above = placed[placed.length - 1];
    const y =
      above && label.y - above.y < LABEL_GAP ? above.y + LABEL_GAP : label.y;
    return [...placed, { ...label, y: Math.max(y, TOP + 12) }];
  }, []);
}
