/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The live view's CSS, added after the report's own (`pageStyles`), which
 * it leaves untouched: the final report stays byte for byte the same.
 * Tokens and sizes are the "State / Live (preliminary)" frame of
 * `designs/benchmarks.pen`. Motion stops under prefers-reduced-motion.
 */
export function liveStyles(): string {
  return `.live-dot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); animation: live-pulse 2s ease-in-out infinite; }
.badge-live { background: #F970661F; color: var(--danger); }
.legend-live { color: var(--danger); }
.legend-live .live-dot { animation: none; }
.live-banner { background: #60A5FA14; border-bottom: 1px solid #60A5FA40; }
.live-banner .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; padding-top: 14px; padding-bottom: 14px; }
.live-banner p { display: flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 14px; }
.live-banner .icon { color: var(--info); }
.updated { color: var(--text-muted); font: 12px var(--font-mono); white-space: nowrap; }
.updated.is-stale { color: var(--warning); }
.updated.is-lost { color: var(--danger); }
.eyebrow-live { color: var(--danger); }
.hero-live .wrap { padding-top: 64px; padding-bottom: 40px; }
.progress .wrap { display: flex; flex-direction: column; gap: 16px; padding-bottom: 56px; }
.steps { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.step { display: flex; flex-direction: column; gap: 6px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; min-width: 0; }
.step-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
.step-sub { color: var(--text-muted); font: 12px var(--font-mono); }
.step-done .step-title .icon { color: var(--success); }
.step-running { background: var(--accent-subtle); border-color: var(--accent); }
.step-running .step-sub { color: var(--accent-text); }
.step-running .step-title .icon { color: var(--accent); animation: live-spin 1.2s linear infinite; }
.step-queued .step-title { color: var(--text-secondary); }
.step-queued .step-title .icon { color: var(--text-muted); }
.overall { display: flex; align-items: center; gap: 16px; }
.track { flex: 1; height: 6px; border-radius: 3px; background: var(--surface); overflow: hidden; }
.track-done { height: 100%; border-radius: 3px; background: var(--accent); transition: width .6s ease; }
.overall-text { color: var(--text-muted); font: 12px var(--font-mono); white-space: nowrap; }
.stat-sub { color: var(--text-muted); font: 12px var(--font-mono); }
.bench-live .wrap { gap: 32px; padding-top: 72px; padding-bottom: 72px; }
.queued-note { color: var(--text-muted); font-size: 14px; }
.so-far { gap: 14px; }
.so-far .so-far-value { color: var(--text-primary); font-size: 28px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2; }
.so-far p { color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
.baseline { display: flex; gap: 10px; padding: 14px; border-radius: 10px; background: var(--accent-subtle); color: var(--accent-text); font-size: 13px; }
.baseline .icon { margin-top: 2px; }
.chart .not-run { fill: #FFFFFF05; }
.chart .not-run-label, .chart .now-label { fill: var(--text-muted); font-size: 11px; }
.chart .now-halo { fill: var(--accent); opacity: .2; }
.chart .now-dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2.5; }
.chart .now-tag { fill: var(--accent); }
.chart .now-tag-text { fill: var(--on-accent); font-size: 12px; font-weight: 500; }
.chart .now-line { stroke: var(--text-muted); stroke-width: 1; }
.rule-note { display: flex; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.rule-note .icon { margin-top: 2px; color: var(--text-muted); }
.empty-chart { color: var(--text-muted); font-size: 14px; }
@keyframes live-pulse { 50% { opacity: .35; } }
@keyframes live-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .live-dot, .step-running .step-title .icon { animation: none; }
  .track-done { transition: none; }
}
@media (max-width: 720px) {
  .hero-live .wrap { padding-top: 32px; padding-bottom: 24px; }
  .progress .wrap { padding-bottom: 32px; }
  .steps { grid-template-columns: minmax(0, 1fr); }
  .bench-live .wrap { gap: 24px; padding-top: 40px; padding-bottom: 40px; }
}`;
}
