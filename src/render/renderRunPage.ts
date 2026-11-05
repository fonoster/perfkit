/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { esc } from "./html.js";
import { pageStyles } from "./pageStyles.js";
import { renderFaviconLink } from "./renderFaviconLink.js";
import { PICKER_SCRIPT } from "./pickerScript.js";
import { renderCapacitySection } from "./sections/renderCapacitySection.js";
import { renderFooter } from "./sections/renderFooter.js";
import { renderHeader } from "./sections/renderHeader.js";
import { renderHeadline } from "./sections/renderHeadline.js";
import { renderHistory } from "./sections/renderHistory.js";
import { renderNav } from "./sections/renderNav.js";
import { renderSetup } from "./sections/renderSetup.js";
import { renderSoakSection } from "./sections/renderSoakSection.js";
import type { PageContext } from "./types.js";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Roboto+Mono:wght@400;500&display=swap";

/**
 * One self-contained report page: inline CSS, charts as inline SVG, fonts
 * from Google Fonts and one small inline script for the run picker. The
 * report and the history must already be validated.
 */
export function renderRunPage(ctx: PageContext): string {
  const { report } = ctx;
  const sections = report.benchmarks
    .map((benchmark, index) =>
      benchmark.kind === "capacity"
        ? renderCapacitySection(benchmark, index, ctx)
        : renderSoakSection(benchmark, index, ctx)
    )
    .join("\n");
  const title = `${report.project.name} benchmarks · v${report.run.version}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${renderFaviconLink(report.project.faviconSvg)}<meta name="description" content="${esc(report.project.title)}">
<meta name="generator" content="perfkit ${esc(ctx.perfkitVersion)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(FONTS)}">
<style>
${pageStyles(report.project.accent)}
</style>
</head>
<body>
${renderNav(ctx)}
<main>
${renderHeader(ctx)}
${renderHeadline(ctx)}
${sections}
${renderHistory(ctx)}
${renderSetup(ctx)}
</main>
${renderFooter(ctx)}
<script>
${PICKER_SCRIPT}
</script>
</body>
</html>
`;
}
