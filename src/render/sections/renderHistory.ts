/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunBenchmark, RunEntry } from "../../schemas/index.js";
import { renderSparkline } from "../charts/renderSparkline.js";
import {
  formatDate,
  formatGrowth,
  formatNumber,
  formatRate,
  plural,
  shortCommit
} from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import type { PageContext } from "../types.js";
import { summaryIcon, summaryText, summaryTone } from "../verdicts.js";

/** The table and the trend show this many runs before "Show all". */
export const TABLE_RUNS = 8;

/**
 * Previous runs: the capacity limit trend (from two runs that have one), a
 * table of this run and the runs before it, and "Show all N runs". The
 * section's id is the target of "See all" and "Show all"; CSS shows the
 * rest of the rows when it is targeted, so it works without script.
 */
export function renderHistory(ctx: PageContext): string {
  const { report, current } = ctx;
  const runs = ctx.runs.slice(
    Math.max(
      0,
      ctx.runs.findIndex((run) => run.id === current.id)
    )
  );
  const capacity = report.benchmarks.find((b) => b.kind === "capacity");
  const soak = report.benchmarks.find((b) => b.kind === "soak");
  const unit = capacity?.unit ?? "calls";
  const limitTitle = capacity ? `${capacity.title} limit` : "Capacity limit";

  const limits = capacity
    ? runs
        .flatMap((run) => {
          const value = limitOf(run.benchmarks, capacity.id);
          return value === null ? [] : [{ run, value }];
        })
        .slice(0, TABLE_RUNS)
        .reverse()
    : [];
  const newest = limits[limits.length - 1];
  const trend =
    limits.length >= 2 && newest
      ? `<div class="card trend">
<p class="trend-title">${esc(limitTitle)}, last ${esc(plural(limits.length, "run"))}</p>
<div class="trend-body">${renderSparkline(limits.map((l) => l.value))}<p class="trend-value">${esc(formatNumber(newest.value))}</p></div>
<p class="visually-hidden">${esc(`${limitTitle} by run, oldest first: ${limits.map((l) => `${formatDate(l.run.startedAt)} ${formatRate(l.value, unit)}`).join("; ")}.`)}</p>
</div>`
      : "";

  const firstRun =
    runs.length === 1
      ? `<div class="callout">${icon("sprout", 16)}<p>History starts with this run. Each new run adds a row here and a point to the capacity limit trend.</p></div>`
      : "";

  const row = (run: RunEntry) => {
    const viewing = run.id === current.id;
    const limitText = !capacity
      ? "--"
      : viewing && capacity.verdict !== "not-run" && "headline" in capacity
        ? currentLimit(capacity.headline, unit)
        : cellText(run.benchmarks, capacity.id, (b) =>
            b.kind === "capacity" && b.headline
              ? b.headline.limitCps === null
                ? "no passing step"
                : formatRate(b.headline.limitCps, unit)
              : null
          );
    const memoryText = !soak
      ? "--"
      : cellText(run.benchmarks, soak.id, (b) =>
          b.kind === "soak" && b.headline
            ? formatGrowth(b.headline.memoryGrowthMBPerHour)
            : null
        );
    const tone = summaryTone(run.verdict);
    const date = formatDate(run.startedAt);
    return `<tr${viewing ? ' class="is-viewing"' : ""}>
<td class="cell-date">${esc(date)}${viewing ? ' <span class="badge">viewing</span>' : ""}</td>
<td class="mono">v${esc(run.version)}</td>
<td class="mono">${esc(shortCommit(run.commit))}</td>
<td class="mono">${esc(limitText)}</td>
<td class="mono">${esc(memoryText)}</td>
<td><span class="result tone-${tone}">${icon(summaryIcon(run.verdict), 15)}${esc(summaryText(run.verdict, true))}</span></td>
<td class="cell-view">${viewing ? "" : `<a href="${esc(ctx.base + run.path)}">View<span class="visually-hidden"> the run of ${esc(date)}</span> ${icon("arrow-right", 14)}</a>`}</td>
</tr>`;
  };

  const shown = runs.slice(0, TABLE_RUNS).map(row).join("\n");
  const rest = runs.slice(TABLE_RUNS).map(row).join("\n");

  return `<section class="history" id="all-runs" aria-labelledby="previous-runs">
<div class="wrap">
<div class="history-head">
<div>
<p class="eyebrow">HISTORY</p>
<h2 class="section-title" id="previous-runs">Previous runs</h2>
<p class="section-sub">Every run keeps its own page and report.json.</p>
</div>
${trend}
</div>
${firstRun}
<div class="table-card">
<div class="scroll-x" tabindex="0" role="group" aria-label="Runs table, scrolls sideways">
<table class="runs">
<thead><tr><th scope="col">Date</th><th scope="col">Version</th><th scope="col">Commit</th><th scope="col">${esc(limitTitle)}</th><th scope="col">${esc(soak ? "Soak memory growth" : "Memory growth")}</th><th scope="col">Result</th><th scope="col"><span class="visually-hidden">Page</span></th></tr></thead>
<tbody>
${shown}
</tbody>
${rest ? `<tbody class="more">\n${rest}\n</tbody>` : ""}
</table>
</div>
${rest ? `<a class="show-all" href="#all-runs">Show all ${esc(plural(runs.length, "run"))}</a>` : ""}
</div>
</div>
</section>`;
}

function limitOf(benchmarks: RunBenchmark[], id: string): number | null {
  const benchmark = benchmarks.find((b) => b.id === id);
  return benchmark?.kind === "capacity" && benchmark.headline
    ? benchmark.headline.limitCps
    : null;
}

function cellText(
  benchmarks: RunBenchmark[],
  id: string,
  measured: (b: RunBenchmark) => string | null
): string {
  const benchmark = benchmarks.find((b) => b.id === id);
  if (!benchmark) return "--";
  return (
    measured(benchmark) ??
    (benchmark.verdict === "not-run" ? "not run" : benchmark.verdict)
  );
}

function currentLimit(
  headline: { limitCps: number | null; limitIsLowerBound: boolean } | null,
  unit: string
): string {
  if (!headline) return "--";
  if (headline.limitCps === null) return "no passing step";
  return `${headline.limitIsLowerBound ? "at least " : ""}${formatRate(headline.limitCps, unit)}`;
}
