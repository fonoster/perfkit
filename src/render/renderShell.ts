/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunEntry } from "../schemas/index.js";
import { SITE_PATHS } from "./app/sitePaths.js";
import { formatDate, formatTime, shortCommit } from "./format.js";
import { esc } from "./html.js";
import { renderFaviconLink } from "./renderFaviconLink.js";
import type { PageKind } from "./types.js";
import { summaryText } from "./verdicts.js";

/**
 * A page's HTML before the app draws it: the run's title, description and
 * Open Graph tags, so a link preview and a crawler see the run, and the
 * pinned app version, which draws the page from the site's data. The latest
 * page (`index.html`) and every `runs/<id>/index.html` are this shell.
 */
export function renderShell(params: {
  /** The project's name, from runs.json. */
  project: string;
  /** The run the page shows: the newest one on the latest page. */
  run: RunEntry;
  page: PageKind;
  perfkitVersion: string;
  /** The project's favicon, from the report being rendered. */
  faviconSvg?: string;
}): string {
  const { project, run, page, perfkitVersion, faviconSvg } = params;
  const base = page === "latest" ? "" : "../../";
  const title = `${project} benchmarks · v${run.version}`;
  const description = `${summaryText(run.verdict)}. ${project} v${run.version}, run of ${formatDate(run.startedAt)} ${formatTime(run.startedAt)} UTC, commit ${shortCommit(run.commit)}.`;
  const reportHref =
    page === "latest"
      ? `${SITE_PATHS.runDir(run.id)}report.json`
      : "report.json";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${renderFaviconLink(faviconSvg)}<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(`${project} benchmarks`)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<meta name="generator" content="perfkit ${esc(perfkitVersion)}">
<script defer src="${esc(base + SITE_PATHS.app(perfkitVersion))}"></script>
</head>
<body>
<noscript><p>This page draws the benchmark results with JavaScript. The results are in <a href="${esc(reportHref)}">report.json</a>.</p></noscript>
</body>
</html>
`;
}
