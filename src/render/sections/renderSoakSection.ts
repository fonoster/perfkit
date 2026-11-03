/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  Hops,
  SoakBenchmarkResult,
  SoakRule
} from "../../schemas/index.js";
import { renderMemoryChart } from "../charts/renderMemoryChart.js";
import {
  formatDuration,
  formatGrowth,
  formatMs,
  formatNumber,
  formatPct,
  formatRate
} from "../format.js";
import { esc } from "../html.js";
import type { MeasuredSoak, PageContext, PartialSoak } from "../types.js";
import {
  verdictIcon,
  verdictLabel,
  verdictPill,
  verdictTone
} from "../verdicts.js";
import {
  banner,
  narrativeCards,
  notRunNote,
  sectionHead
} from "./benchmarkParts.js";

const HOP_COLORS = ["s-1", "s-4", "s-3", "s-2", "s-5"];

/**
 * A soak benchmark: its head and load line, the narrative, and by verdict
 * either memory per process with the stability checks, what was measured
 * before the run stopped, or where its last result is.
 */
export function renderSoakSection(
  benchmark: SoakBenchmarkResult,
  index: number,
  ctx: PageContext
): string {
  const meta = benchmark.verdict === "not-run" ? "" : benchmark.tool;
  const sub =
    benchmark.verdict === "passed" || benchmark.verdict === "failed"
      ? loadLine(benchmark)
      : "";
  const body = bodyFor(benchmark, ctx);

  return `<section class="bench bench-sunken" id="${esc(benchmark.id)}" aria-labelledby="${esc(benchmark.id)}-title">
<div class="wrap">
${sectionHead(benchmark, index, meta, sub)}
${body}
</div>
</section>`;
}

function bodyFor(benchmark: SoakBenchmarkResult, ctx: PageContext): string {
  switch (benchmark.verdict) {
    case "not-run":
      return `${notRunNote(benchmark, ctx)}\n${narrativeCards(benchmark)}`;
    case "passed":
    case "failed":
      return measured(benchmark);
    default:
      return partial(benchmark);
  }
}

/** `6 h + 30 min warm-up · steady 100 calls/s, 30 s calls, 200 agents` */
function loadLine(benchmark: MeasuredSoak): string {
  const { unit } = benchmark;
  return [
    `${formatDuration(benchmark.durationS - benchmark.warmupS)} + ${formatDuration(benchmark.warmupS)} warm-up`,
    [
      `steady ${formatRate(benchmark.load.cps, unit)}`,
      benchmark.load.holdS > 0
        ? `${formatDuration(benchmark.load.holdS)} ${unit}`
        : "",
      `${formatNumber(benchmark.headline.registrations, 0)} agents`
    ]
      .filter(Boolean)
      .join(", ")
  ].join(" · ");
}

function ruleName(rule: SoakRule, unit: string): string {
  if (rule.id === "memoryGrowthMBPerHour") return "Memory growth";
  if (rule.id === "failedCallsPct") return `Failed ${unit}`;
  return "Restarts";
}

function ruleValue(rule: SoakRule): string {
  if (rule.id === "memoryGrowthMBPerHour") {
    return `${rule.process} ${formatGrowth(rule.measured)} · limit under ${formatNumber(rule.limit)}`;
  }
  if (rule.id === "failedCallsPct") {
    return `${formatPct(rule.measured)} · limit under ${formatPct(rule.limit)}`;
  }
  return `${formatNumber(rule.measured, 0)} · limit ${formatNumber(rule.limit, 0)}`;
}

/** `edgeport memory grew 7.8 MB/h (limit: under 5 MB/h)` */
function failedClause(rule: SoakRule, unit: string): string {
  if (rule.id === "memoryGrowthMBPerHour") {
    return `${rule.process} memory grew ${formatNumber(rule.measured)} MB/h (limit: under ${formatNumber(rule.limit)} MB/h)`;
  }
  if (rule.id === "failedCallsPct") {
    return `failed ${unit} reached ${formatPct(rule.measured)} (limit: under ${formatPct(rule.limit)})`;
  }
  return `${formatNumber(rule.measured, 0)} restarts (limit: ${formatNumber(rule.limit, 0)})`;
}

function measured(benchmark: MeasuredSoak): string {
  const { unit } = benchmark;
  const failed = benchmark.rules.filter((r) => !r.passed);
  const growth = new Map(
    benchmark.rules.flatMap((r) =>
      r.id === "memoryGrowthMBPerHour"
        ? [[r.process, r.measured] as [string, number]]
        : []
    )
  );
  const chart = renderMemoryChart({
    processes: benchmark.resources.processes,
    durationS: benchmark.durationS,
    warmupS: benchmark.warmupS,
    growth,
    partial: false
  });
  const checks = benchmark.rules
    .map(
      (rule) => `<div class="row check">
<dt><span class="check-status">${verdictPill(rule.passed ? "passed" : "failed")}</span>${esc(ruleName(rule, unit))}</dt>
<dd>${esc(ruleValue(rule))}</dd>
</div>`
    )
    .join("");
  const { reported, headline } = benchmark;
  const maxFds = Math.max(0, ...Object.values(reported.maxOpenFds));
  const also = [
    `p99 ${formatNumber(reported.p99FirstHourMs)} to ${formatMs(reported.p99LastHourMs)} (first vs last hour)`,
    `open files up to ${formatNumber(maxFds, 0)}`,
    `at most ${formatNumber(reported.maxConcurrentCalls, 0)} concurrent ${unit}`,
    `failed re-registrations ${formatNumber(headline.registerFailures, 0)} of ${formatNumber(headline.registrations, 0)}`
  ].join(", ");

  return `${failed.length > 0 ? banner("danger", verdictIcon("failed"), esc(`Failed: ${failed.map((r) => failedClause(r, unit)).join("; ")}.`)) : ""}
${narrativeCards(benchmark)}
<div class="results">
${chart}
<div class="card card-surface side-card">
<h3 class="card-title">Stability checks</h3>
<p class="card-sub">after the ${esc(formatDuration(benchmark.warmupS))} warm-up</p>
<dl class="rows">${checks}</dl>
</div>
</div>
<p class="also"><strong>Also measured:</strong> ${esc(also)}.</p>
${benchmark.hops ? renderHops(benchmark.hops) : ""}`;
}

function partial(benchmark: PartialSoak): string {
  const processes = (benchmark.resources?.processes ?? []).filter(
    (p) => p.samples.length > 0
  );
  const duration = formatDuration(benchmark.durationS);
  const lead =
    benchmark.verdict === "aborted"
      ? `Aborted after ${duration}: ${benchmark.reason}. No verdict.`
      : `Inconclusive: ${benchmark.reason}. No verdict.`;
  const sentence =
    processes.length > 0 && benchmark.verdict === "aborted"
      ? `${lead} The chart shows the first ${duration}.`
      : lead;
  const chart =
    processes.length > 0
      ? renderMemoryChart({
          processes,
          durationS: benchmark.durationS,
          warmupS: null,
          growth: new Map(),
          partial: true
        })
      : "";
  return `${banner(verdictTone(benchmark.verdict), verdictIcon(benchmark.verdict), esc(sentence))}
${narrativeCards(benchmark)}
<div class="results${chart ? "" : " results-single"}">
${chart}
<div class="card card-surface side-card">
<h3 class="card-title">Stability checks: not evaluated (run ${esc(verdictLabel(benchmark.verdict).toLowerCase())})</h3>
</div>
</div>`;
}

/** Where the time goes: each service's median time per request. */
function renderHops(hops: Hops): string {
  const total = hops.services.reduce((sum, s) => sum + s.p50Ms, 0);
  const bar = hops.services
    .map(
      (s, i) =>
        `<span class="hop ${HOP_COLORS[i % HOP_COLORS.length]}" style="flex-grow:${s.p50Ms}"></span>`
    )
    .join("");
  const legend = hops.services
    .map(
      (s, i) =>
        `<li><span class="hop-name"><span class="swatch ${HOP_COLORS[i % HOP_COLORS.length]}" aria-hidden="true"></span>${esc(s.service)}</span><span class="hop-value">${esc(formatMs(s.p50Ms))}</span><span class="hop-p99">p99 ${esc(formatMs(s.p99Ms))}</span></li>`
    )
    .join("");
  return `<div class="card card-surface hops">
<div class="hops-head">
<div><h3 class="card-title">Where the time goes</h3><p class="card-sub">median time in each service per request, from a ${esc(formatPct(hops.sampleRatio * 100))} sample of OpenTelemetry traces</p></div>
<p class="hops-total">${esc(formatMs(total))} total</p>
</div>
<div class="hop-bar" aria-hidden="true">${bar}</div>
<ul class="hop-legend">${legend}</ul>
</div>`;
}
