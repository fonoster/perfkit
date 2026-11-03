/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatDate, formatShortDate, formatTime, plural } from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import type { PageContext } from "../types.js";
import { summaryText, summaryTone } from "../verdicts.js";
import { renderLogo } from "./renderLogo.js";

/** The picker lists at most this many runs; "See all" leads to the rest. */
export const PICKER_RUNS = 8;

/**
 * The nav: the project's logo, "/ Benchmarks", the run picker and a link to
 * this run's report.json. The picker is a button with `aria-expanded` that
 * opens a list of links; the page's inline script opens and closes it.
 *
 * Only `/benchmarks/` says "latest": a run page is never rewritten, so it
 * would go stale.
 */
export function renderNav(ctx: PageContext): string {
  const { report, current, base, page } = ctx;
  const latest = page === "latest";
  const items = ctx.runs.slice(0, PICKER_RUNS).map((run, i) => {
    const viewing = run.id === current.id;
    const sub = [
      latest && i === 0 ? "latest" : "",
      viewing ? "viewing" : "",
      summaryText(run.verdict, true)
    ]
      .filter(Boolean)
      .join(" · ");
    return `<li><a class="picker-item${viewing ? " is-viewing" : ""}" href="${esc(viewing && latest ? "./" : base + run.path)}"${viewing ? ' aria-current="page"' : ""}>
<span class="picker-row"><span class="picker-date">${esc(formatDate(run.startedAt))} ${esc(formatTime(run.startedAt))}</span><span class="picker-version">v${esc(run.version)}</span></span>
<span class="picker-sub tone-${summaryTone(run.verdict)}">${esc(sub)}</span>
</a></li>`;
  });
  const latestLink = latest
    ? ""
    : `<li><a class="picker-item" href="${esc(base)}"><span class="picker-row"><span class="picker-date">Latest run</span></span><span class="picker-sub">the newest results</span></a></li>`;
  const seeAll =
    ctx.runs.length > PICKER_RUNS
      ? `<a class="picker-all" href="#all-runs">See all ${esc(plural(ctx.runs.length, "run"))}</a>`
      : "";

  const logo = renderLogo(report.project);
  const reportHref = latest ? `${current.path}report.json` : "report.json";
  const version = `v${report.run.version}`;

  return `<header class="nav">
<div class="wrap nav-inner">
<div class="brand"><a class="brand-link" href="${esc(base || "./")}">${logo}</a><span class="slash" aria-hidden="true">/</span><span class="product">Benchmarks</span></div>
<div class="actions">
<div class="picker" data-picker>
<button type="button" class="button picker-button" aria-expanded="false" aria-controls="run-list">
${icon("history", 16)}<span class="picker-label"><span class="long">${esc(formatDate(report.run.startedAt))} · ${esc(version)}</span><span class="short">${esc(formatShortDate(report.run.startedAt))} · ${esc(version)}</span></span>${latest ? '<span class="badge">latest</span>' : ""}<span class="visually-hidden">, choose a run</span>${icon("chevron-down", 16)}
</button>
<div class="picker-panel" id="run-list" hidden>
<p class="picker-title" id="run-list-title">Runs, newest first</p>
<ul class="picker-list" aria-labelledby="run-list-title">
${latestLink}
${items.join("\n")}
</ul>
${seeAll}
</div>
</div>
<a class="button report-link" href="${esc(reportHref)}" aria-label="This run's report.json">${icon("file-json", 16)}<span>report.json</span></a>
</div>
</div>
</header>`;
}
