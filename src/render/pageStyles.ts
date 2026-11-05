/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The page's CSS. The tokens are the dark-mode variables of
 * `designs/benchmarks.pen` in fonoster/routr; the accent comes from report.json
 * (`project.accent`, a validated `#RRGGBB`).
 */
export function pageStyles(accent: string): string {
  return `:root {
  --bg: #181818;
  --surface: #202020;
  --surface-sunken: #121212;
  --border: #333333;
  --text-primary: #FFFFFF;
  --text-secondary: #E8E8E8;
  --text-muted: #C2C2C2;
  --accent: ${accent};
  --accent-text: ${accent};
  --accent-subtle: ${accent}33;
  --on-accent: #001A1A;
  --success: #39E19E;
  --warning: #F5A524;
  --danger: #F97066;
  --info: #60A5FA;
  --series-2: #A78BFA;
  --series-3: #FB923C;
  --series-4: #F472B6;
  --font-display: "Poppins", system-ui, sans-serif;
  --font-mono: "Roboto Mono", ui-monospace, monospace;
  --gutter: 80px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text-primary); font-family: var(--font-display); font-size: 14px; line-height: 1.5; }
p, h1, h2, h3, dl, dd, figure, ul { margin: 0; }
ul { padding: 0; list-style: none; }
a { color: var(--accent-text); }
a:focus-visible, button:focus-visible, [tabindex]:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wrap { max-width: 1440px; margin: 0 auto; padding: 0 var(--gutter); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.icon { flex: none; }
.mono, .section-meta, .chip, .eyebrow, .badge, .tag { font-family: var(--font-mono); }
.eyebrow { color: var(--accent-text); font-size: 13px; font-weight: 500; letter-spacing: 1.5px; }

/* Nav */
.nav { border-bottom: 1px solid var(--border); }
.nav-inner { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; padding-top: 20px; padding-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand-link { display: flex; color: var(--text-primary); text-decoration: none; }
.logo { display: block; height: 28px; width: auto; }
.logo-text { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; }
.slash { color: var(--text-muted); font-size: 20px; }
.product { font-size: 17px; font-weight: 500; }
.actions { display: flex; align-items: center; gap: 12px; }
.button { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--text-primary); font: 500 13px var(--font-mono); text-decoration: none; cursor: pointer; }
.button .icon { color: var(--text-secondary); }
.button:hover { background: var(--surface); }
.picker { position: relative; }
.picker-button { gap: 10px; }
.picker-button[aria-expanded="true"] { border-color: var(--accent); }
.picker-button[aria-expanded="true"] .icon:last-child { transform: rotate(180deg); }
.picker-label .short { display: none; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 6px; background: var(--accent-subtle); color: var(--accent-text); font-size: 11px; font-weight: 500; }
.picker-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 10; width: 340px; max-width: calc(100vw - 32px); padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.5); }
.picker-panel[hidden] { display: none; }
.picker-title { padding: 6px 8px 8px; color: var(--text-muted); font-size: 12px; }
.picker-item { display: block; padding: 10px 12px; border-radius: 8px; color: var(--text-primary); text-decoration: none; }
.picker-item:hover, .picker-item:focus-visible { background: #2a2a2a; }
.picker-item.is-viewing { background: var(--accent-subtle); }
.picker-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 600; }
.picker-version { font-family: var(--font-mono); font-weight: 500; }
.picker-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--text-muted); }
.picker-all { display: block; margin-top: 4px; padding: 12px; border-top: 1px solid var(--border); font-size: 13px; font-weight: 500; text-decoration: none; }
.tone-success { color: var(--success); }
.tone-danger { color: var(--danger); }
.tone-warning { color: var(--warning); }
.tone-neutral { color: var(--text-muted); }

/* Header */
.viewing-banner { background: var(--accent-subtle); border-bottom: 1px solid var(--border); }
.viewing-banner .wrap { display: flex; align-items: center; gap: 10px; padding-top: 14px; padding-bottom: 14px; }
.viewing-banner .icon { color: var(--accent-text); }
.hero .wrap { display: flex; flex-direction: column; gap: 20px; padding-top: 72px; padding-bottom: 56px; }
.title { font-size: 56px; font-weight: 600; letter-spacing: -1.5px; line-height: 1.1; }
.lead { max-width: 780px; color: var(--text-secondary); font-size: 18px; line-height: 1.6; }
.run-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding-top: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-secondary); font-size: 13px; }
.chip .icon { color: var(--text-muted); }
.chip:first-child { font-family: var(--font-display); }
.permalink a { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; text-decoration: none; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid; border-radius: 999px; font-size: 13px; font-weight: 500; white-space: nowrap; }
.pill-lg { gap: 8px; padding: 7px 14px; }
.pill-success { color: var(--success); background: #39E19E1F; border-color: #39E19E55; }
.pill-danger { color: var(--danger); background: #F970661F; border-color: #F9706655; }
.pill-warning { color: var(--warning); background: #F5A5241F; border-color: #F5A52455; }
.pill-neutral { color: var(--text-secondary); background: #FFFFFF0F; border-color: var(--border); }

/* Headline */
.headline { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.stats { display: grid; grid-template-columns: repeat(var(--cells, 4), minmax(0, 1fr)); }
.stats-1 { --cells: 1; } .stats-2 { --cells: 2; } .stats-3 { --cells: 3; }
.stat { display: flex; flex-direction: column; gap: 8px; padding: 44px 40px; border-left: 1px solid var(--border); }
.stat:first-child { padding-left: 0; border-left: 0; }
.stat-value { font-size: clamp(28px, 3.9vw, 56px); font-weight: 600; letter-spacing: -2px; line-height: 1; white-space: nowrap; }
.stat-label { color: var(--text-secondary); font-size: 14px; }
.delta { display: flex; align-items: center; gap: 6px; font: 12px var(--font-mono); }
.delta-better { color: var(--success); }
.delta-worse { color: var(--danger); }
.delta-same { color: var(--text-muted); }
.headline-caption { padding: 0 0 20px; color: var(--text-muted); font-size: 13px; }

/* Benchmark sections */
.bench .wrap { display: flex; flex-direction: column; gap: 40px; padding-top: 88px; padding-bottom: 88px; }
.bench-sunken { background: var(--surface-sunken); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.section-head { display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; align-items: flex-end; }
.section-head-main { display: flex; flex-direction: column; gap: 12px; }
.title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.section-title { font-size: 40px; font-weight: 600; letter-spacing: -1px; line-height: 1.2; }
.section-sub { color: var(--text-secondary); font-size: 14px; }
.section-meta { color: var(--text-muted); font-size: 13px; }
.banner { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; border: 1px solid; border-radius: 10px; font-size: 14px; font-weight: 500; }
.banner .icon { margin-top: 2px; }
.banner a { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; text-decoration: none; }
.banner-danger { color: var(--text-primary); background: #F9706614; border-color: #F9706655; }
.banner-danger .icon { color: var(--danger); }
.banner-warning { color: var(--text-primary); background: #F5A52414; border-color: #F5A52455; }
.banner-warning .icon { color: var(--warning); }
.banner-neutral { color: var(--text-primary); background: var(--surface); border-color: var(--border); }
.banner-neutral .icon { color: var(--text-muted); }
.card { display: flex; flex-direction: column; gap: 10px; padding: 24px; border: 1px solid var(--border); border-radius: 14px; min-width: 0; }
.card-surface { background: var(--surface); }
.card-title { font-size: 16px; font-weight: 600; }
.card-title.with-icon { display: flex; align-items: center; gap: 10px; }
.accent-icon { display: flex; color: var(--accent); }
.card-sub { color: var(--text-muted); font-size: 13px; }
.narrative { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.narrative-card p { color: var(--text-secondary); font-size: 14px; line-height: 1.6; }
.results { display: grid; grid-template-columns: minmax(0, 868fr) minmax(0, 392fr); gap: 20px; align-items: start; }
.results-single { grid-template-columns: minmax(0, 1fr); }
.side-card { gap: 4px; }
.rows { padding-top: 16px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: 0; }
.row dt { display: flex; align-items: center; gap: 10px; color: var(--text-secondary); }
.row dd { font: 500 14px var(--font-mono); text-align: right; }
.check { flex-wrap: wrap; row-gap: 4px; }
.check dt { white-space: nowrap; }
.check dd { margin-left: auto; }
.check .pill { padding: 2px 8px; font-size: 12px; }
.takeaway { display: flex; gap: 10px; margin-top: 12px; padding: 14px; border-radius: 10px; background: var(--accent-subtle); font-size: 13px; line-height: 1.5; }
.takeaway .icon { color: var(--accent-text); margin-top: 2px; }
.also { color: var(--text-secondary); font-size: 14px; }
.also strong { color: var(--text-primary); font-weight: 600; }

/* Charts */
.chart-card { gap: 16px; padding: 24px 24px 16px; }
.chart-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
.chart-head-side { display: flex; align-items: center; gap: 16px; }
.legend { display: flex; flex-wrap: wrap; gap: 16px; color: var(--text-secondary); font: 12px var(--font-mono); }
.legend li { display: flex; align-items: center; gap: 6px; }
.swatch { display: inline-block; width: 14px; height: 3px; border-radius: 2px; background: currentColor; }
.tag { padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--text-secondary); font-size: 12px; }
.scroll-x { position: relative; overflow-x: auto; }
.chart { display: block; width: 100%; min-width: 620px; height: auto; font-family: var(--font-mono); }
.scroll-hint { display: none; color: var(--text-muted); font: 12px var(--font-mono); }
.chart .grid { stroke: var(--border); stroke-width: 1; }
.chart .axis { stroke: #555555; stroke-width: 1; }
.chart .tick, .chart .axis-unit { fill: var(--text-muted); font-size: 11px; }
.chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.s-p99, .s-1 { color: var(--accent); stroke: var(--accent); fill: var(--accent); }
.s-p95, .s-2 { color: var(--series-2); stroke: var(--series-2); fill: var(--series-2); }
.s-p50 { color: var(--text-muted); stroke: var(--text-muted); fill: var(--text-muted); }
.s-3 { color: var(--series-3); stroke: var(--series-3); fill: var(--series-3); }
.s-4 { color: var(--series-4); stroke: var(--series-4); fill: var(--series-4); }
.s-5 { color: var(--info); stroke: var(--info); fill: var(--info); }
.chart .line.s-p99, .chart .line.s-p95, .chart .line.s-p50, .chart .line[class*="s-"] { fill: none; }
.chart .line-label { stroke: none; font-size: 11px; paint-order: stroke; }
.chart .over-limit { fill: #F9706614; }
.chart .over-limit-label, .chart .threshold-label { fill: var(--danger); font-size: 11px; }
.chart .threshold { stroke: var(--danger); stroke-width: 1; stroke-dasharray: 5 4; }
.chart .limit-line { stroke: var(--accent); stroke-width: 1.5; }
.chart .limit-dot { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
.chart .limit-tag { fill: var(--accent); }
.chart .limit-tag-text { fill: var(--on-accent); font-size: 12px; font-weight: 500; }
.chart .warmup { fill: #FFFFFF0A; }
.chart .warmup-label, .chart .partial-label { fill: var(--text-muted); font-size: 11px; }
.chart-data summary { cursor: pointer; color: var(--text-muted); font-size: 13px; }
table { border-collapse: collapse; }
.data { width: 100%; margin-top: 12px; font: 12px var(--font-mono); }
.data th, .data td { padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
.data th:first-child, .data td:first-child { text-align: left; }
.data thead th { color: var(--text-muted); font-weight: 500; }

/* Where the time goes */
.hops { gap: 20px; }
.hops-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.hops-total { font: 500 14px var(--font-mono); }
.hop-bar { display: flex; gap: 3px; height: 14px; border-radius: 7px; overflow: hidden; }
.hop { display: block; min-width: 3px; background: currentColor; }
.hop-legend { display: flex; flex-wrap: wrap; gap: 16px 40px; }
.hop-legend li { display: flex; flex-direction: column; gap: 4px; }
.hop-name { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 12px; }
.hop-name .swatch { width: 8px; height: 8px; border-radius: 2px; }
.hop-value { font: 500 13px var(--font-mono); }
.hop-p99 { color: var(--text-muted); font: 11px var(--font-mono); }

/* History */
.history .wrap { display: flex; flex-direction: column; gap: 32px; padding-top: 88px; padding-bottom: 56px; }
.history-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 24px; }
.history-head > div:first-child { display: flex; flex-direction: column; gap: 12px; }
.trend { gap: 8px; padding: 16px 20px; border-radius: 12px; }
.trend-title { color: var(--text-muted); font-size: 12px; }
.trend-body { display: flex; align-items: center; gap: 16px; }
.trend-value { font: 600 18px var(--font-mono); }
.sparkline path { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; }
.sparkline circle { fill: var(--accent); }
.callout { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-secondary); font-size: 13px; }
.callout .icon { color: var(--accent-text); }
.table-card { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.runs { width: 100%; min-width: 860px; }
.runs th { padding: 14px 24px; background: var(--surface); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 500; text-align: left; }
.runs td { padding: 16px 24px; border-bottom: 1px solid var(--border); font-size: 13px; white-space: nowrap; }
.runs tbody:last-of-type tr:last-child td { border-bottom: 0; }
.runs .cell-date { font-weight: 500; }
.runs .badge { margin-left: 8px; }
.runs tr.is-viewing td { background: var(--accent-subtle); }
.result { display: inline-flex; align-items: center; gap: 6px; }
.cell-view { text-align: right; }
.cell-view a { display: inline-flex; align-items: center; gap: 4px; text-decoration: none; font-weight: 500; }
.runs tbody.more { display: none; }
#all-runs:target tbody.more { display: table-row-group; }
#all-runs:target .show-all { display: none; }
.show-all { display: block; padding: 14px 24px; background: var(--surface); border-top: 1px solid var(--border); color: var(--text-primary); font-size: 13px; font-weight: 500; text-align: center; text-decoration: none; }

/* Test setup */
.setup .wrap { display: flex; flex-direction: column; gap: 24px; padding-top: 32px; padding-bottom: 88px; }
.setup-title { font-size: 24px; font-weight: 600; }
.setup-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.setup-grid .card { gap: 4px; }
.setup-grid .card-title .icon { color: var(--accent-text); }
.setup-grid .rows { padding-top: 12px; }
.setup-grid .row { padding: 10px 0; border: 0; font-size: 13px; }
.setup-grid .row dd { font-size: 13px; }
.reproduce { gap: 14px !important; }
.reproduce p { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.command { margin: 0; padding: 14px 16px; overflow-x: auto; border-radius: 10px; background: var(--surface-sunken); border: 1px solid var(--border); font: 12px/1.6 var(--font-mono); white-space: pre; }

/* Footer */
.footer { border-top: 1px solid var(--border); }
.footer-inner { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; padding-top: 28px; padding-bottom: 28px; }
.footer-brand { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
.generated { color: var(--text-muted); font-size: 13px; }
.footer-links { display: flex; gap: 28px; font-size: 13px; }
.footer-links a { color: var(--text-secondary); text-decoration: none; }

@media (max-width: 1100px) {
  :root { --gutter: 40px; }
  .results { grid-template-columns: minmax(0, 1fr); }
  .setup-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  :root { --gutter: 16px; }
  .slash, .product, .report-link span { display: none; }
  .picker-label .long { display: none; }
  .picker-label .short { display: inline; }
  .picker-button .badge { display: none; }
  .hero .wrap { gap: 16px; padding-top: 32px; padding-bottom: 32px; }
  .title { font-size: 30px; letter-spacing: -0.5px; }
  .lead { font-size: 15px; }
  .stats, .stats-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stats-1 { grid-template-columns: minmax(0, 1fr); }
  .stat { padding: 20px 12px; border-bottom: 1px solid var(--border); }
  .stat:nth-child(odd) { padding-left: 0; border-left: 0; }
  .stat-value { font-size: 28px; letter-spacing: -1px; }
  .stat-label { font-size: 12px; }
  .headline-caption { padding-top: 12px; }
  .bench .wrap { gap: 24px; padding-top: 40px; padding-bottom: 40px; }
  .section-title { font-size: 24px; }
  .narrative { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .card { padding: 16px; }
  .scroll-hint { display: block; }
  .history .wrap { padding-top: 40px; }
  .setup .wrap { padding-bottom: 40px; }
  .footer-links { gap: 16px; }
}`;
}
