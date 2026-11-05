/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatDate, formatTime, plural } from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import { PICKER_RUNS } from "../sections/renderNav.js";
import { renderLogo } from "../sections/renderLogo.js";
import { summaryText, summaryTone } from "../verdicts.js";
import type { LiveViewContext } from "./types.js";

/**
 * The live page's nav: the logo and "/ Benchmarks", and the run picker
 * showing the run in progress, "Running now · v<version>" with a live dot
 * and badge. Its list holds the run in progress and the published runs.
 */
export function renderLiveNav(ctx: LiveViewContext): string {
  const { live, runs } = ctx;
  const version = `v${live.version}`;
  const items = runs.slice(0, PICKER_RUNS).map(
    (run) => `<li><a class="picker-item" href="${esc(run.path)}">
<span class="picker-row"><span class="picker-date">${esc(formatDate(run.startedAt))} ${esc(formatTime(run.startedAt))}</span><span class="picker-version">v${esc(run.version)}</span></span>
<span class="picker-sub tone-${summaryTone(run.verdict)}">${esc(summaryText(run.verdict, true))}</span>
</a></li>`
  );
  const seeAll =
    runs.length > PICKER_RUNS
      ? `<p class="picker-title">${esc(plural(runs.length, "published run"))}</p>`
      : "";
  return `<header class="nav">
<div class="wrap nav-inner">
<div class="brand"><a class="brand-link" href="./">${renderLogo(live.project)}</a><span class="slash" aria-hidden="true">/</span><span class="product">Benchmarks</span></div>
<div class="actions">
<div class="picker" data-picker>
<button type="button" class="button picker-button" aria-expanded="false" aria-controls="run-list">
<span class="live-dot" aria-hidden="true"></span><span class="picker-label"><span class="long">Running now · ${esc(version)}</span><span class="short">Now · ${esc(version)}</span></span><span class="badge badge-live">live</span><span class="visually-hidden">, choose a run</span>${icon("chevron-down", 16)}
</button>
<div class="picker-panel" id="run-list" hidden>
<p class="picker-title" id="run-list-title">Runs, newest first</p>
<ul class="picker-list" aria-labelledby="run-list-title">
<li><a class="picker-item is-viewing" href="./" aria-current="page"><span class="picker-row"><span class="picker-date">Running now</span><span class="picker-version">${esc(version)}</span></span><span class="picker-sub">live · preliminary</span></a></li>
${items.join("\n")}
</ul>
${seeAll}
</div>
</div>
</div>
</div>
</header>`;
}
