/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { esc } from "../html.js";
import { pageStyles } from "../pageStyles.js";
import { PICKER_SCRIPT } from "../pickerScript.js";
import { liveStyles } from "./liveStyles.js";
import { renderLiveView } from "./renderLiveView.js";
import type { LiveViewContext } from "./types.js";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Roboto+Mono:wght@400;500&display=swap";

/**
 * The whole live page, the report page's head and styles plus the live
 * view's: the app mounts it once per run, then replaces the banner, main
 * and footer (`#live-banner`, `#live-main`, `#live-footer`) on each poll.
 */
export function renderLivePage(ctx: LiveViewContext): string {
  const { live } = ctx;
  const parts = renderLiveView(ctx);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${live.project.name} benchmarks · running now · v${live.version}`)}</title>
<meta name="description" content="${esc(live.project.title)}">
<meta name="generator" content="perfkit ${esc(ctx.perfkitVersion)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(FONTS)}">
<style>
${pageStyles(live.project.accent)}
${liveStyles()}
</style>
</head>
<body data-live-run="${esc(live.runId)}">
${parts.nav}
<div id="live-banner">${parts.banner}</div>
<main id="live-main">
${parts.main}
</main>
<div id="live-footer">${parts.footer}</div>
<script>
${PICKER_SCRIPT}
</script>
</body>
</html>
`;
}
