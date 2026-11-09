/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The parts every benchmark section shares: the head with its status pill,
 * the three narrative cards, the verdict banner and the not-run note.
 */
import type { BenchmarkResult, CapacityRule } from "../../schemas/index.js";
import { findEarlierResult } from "../findEarlierResult.js";
import { formatDate, formatMs, formatPct } from "../format.js";
import { esc } from "../html.js";
import { icon, type IconName } from "../icons.js";
import type { PageContext } from "../types.js";
import {
  type Tone,
  verdictIcon,
  verdictLabel,
  verdictPill
} from "../verdicts.js";

/**
 * `01 · CAPACITY · Single server`, the title with its pill, and a meta
 * line. The target is left out when the report does not name it.
 */
export function sectionHead(
  benchmark: BenchmarkResult,
  index: number,
  meta: string,
  sub = "",
  target: string | null = null
): string {
  const number = String(index + 1).padStart(2, "0");
  return `<div class="section-head">
<div class="section-head-main">
<p class="eyebrow">${number} · ${esc(benchmark.kind.toUpperCase())}${target ? ` · <span class="target">${esc(target)}</span>` : ""}</p>
<div class="title-row"><h2 id="${esc(benchmark.id)}-title" class="section-title">${esc(benchmark.title)}</h2>${verdictPill(benchmark.verdict)}</div>
${sub ? `<p class="section-sub">${esc(sub)}</p>` : ""}
</div>
${meta ? `<p class="section-meta">${esc(meta)}</p>` : ""}
</div>`;
}

const NARRATIVE: Array<["what" | "why" | "how", string, IconName]> = [
  ["what", "What it measures", "crosshair"],
  ["why", "Why it matters", "lightbulb"],
  ["how", "How it runs", "activity"]
];

/** What it measures, why it matters, how it runs. */
export function narrativeCards(benchmark: BenchmarkResult): string {
  const cards = NARRATIVE.map(
    ([key, title, glyph]) => `<div class="card narrative-card">
<h3 class="card-title with-icon"><span class="accent-icon">${icon(glyph, 18)}</span>${title}</h3>
<p>${esc(benchmark.narrative[key])}</p>
</div>`
  ).join("\n");
  return `<div class="narrative">${cards}</div>`;
}

/** A sentence in a tinted box, led by the verdict's icon. */
export function banner(tone: Tone, glyph: IconName, html: string): string {
  return `<div class="banner banner-${tone}">${icon(glyph, 16)}<p>${html}</p></div>`;
}

/**
 * For a benchmark that was not part of this run: where its last result is,
 * or that it has never run.
 */
export function notRunNote(
  benchmark: BenchmarkResult,
  ctx: PageContext
): string {
  const last = findEarlierResult(ctx.runs, ctx.current, benchmark.id, (b) =>
    b.verdict === "passed" || b.verdict === "failed" ? b.verdict : null
  );
  const text = last
    ? `This benchmark was not part of this run. Last result: ${verdictLabel(last.value)} on ${esc(formatDate(last.run.startedAt))} (v${esc(last.run.version)}). <a href="${esc(ctx.base + last.run.path)}">View that run ${icon("arrow-right", 14)}</a>`
    : "This benchmark has not run yet.";
  return banner("neutral", verdictIcon("not-run"), text);
}

/** How a capacity rule is named in sentences: `p99`, `failed messages`. */
export function capacityRuleName(rule: CapacityRule["id"], unit: string) {
  return rule === "p99LatencyMs" ? "p99" : `failed ${unit}`;
}

/** A capacity rule's value with its unit: `62 ms`, `0.2%`. */
export function capacityRuleValue(rule: CapacityRule["id"], value: number) {
  return rule === "p99LatencyMs" ? formatMs(value) : formatPct(value);
}
