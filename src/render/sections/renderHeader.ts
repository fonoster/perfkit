/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatDate, formatRanAt, formatTime, shortCommit } from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import type { PageContext } from "../types.js";
import { summaryIcon, summaryText, summaryTone } from "../verdicts.js";

/**
 * The page header: on a run page, the "You're viewing" banner first; then
 * the eyebrow, the project's title and lead, the verdict pill and the run's
 * chips. `/benchmarks/` adds "Link to this run".
 */
export function renderHeader(ctx: PageContext): string {
  const { report, current, base, page } = ctx;
  const { run, project } = report;
  const viewing =
    page === "run"
      ? `<div class="viewing-banner"><div class="wrap">${icon("history", 16)}<p>You're viewing the run of ${esc(formatDate(run.startedAt))} ${esc(formatTime(run.startedAt))} UTC. <a href="${esc(base)}">See the latest run</a></p></div></div>`
      : "";
  const chips: Array<[Parameters<typeof icon>[0], string]> = [
    ["calendar", `Ran ${formatRanAt(run.startedAt)}`],
    ["tag", `v${run.version}`],
    ["git-commit", shortCommit(run.commit)],
    ["server", `${run.infra.region} · ${run.infra.uut.size}`]
  ];
  const tone = summaryTone(report.verdict);
  return `${viewing}
<div class="hero">
<div class="wrap">
<p class="eyebrow">BENCHMARKS · ${esc(project.name.toUpperCase())}</p>
<h1 class="title">${esc(project.title)}</h1>
<p class="lead">${esc(project.lead)}</p>
<div class="run-meta">
<p class="pill pill-lg pill-${tone} verdict">${icon(summaryIcon(report.verdict), 15)}${esc(summaryText(report.verdict))}</p>
<ul class="chips">${chips.map(([glyph, text]) => `<li class="chip">${icon(glyph, 14)}<span>${esc(text)}</span></li>`).join("")}</ul>
</div>
${page === "latest" ? `<p class="permalink"><a href="${esc(current.path)}">${icon("link", 14)}Link to this run</a></p>` : ""}
</div>
</div>`;
}
