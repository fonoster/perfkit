/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { CapacityBenchmarkResult } from "../../schemas/index.js";
import { renderLatencyChart } from "../charts/renderLatencyChart.js";
import { formatDuration, formatMs, formatPct, formatRate } from "../format.js";
import { esc } from "../html.js";
import { targetLabel } from "../targetLabel.js";
import { icon } from "../icons.js";
import type {
  MeasuredCapacity,
  PageContext,
  PartialCapacity
} from "../types.js";
import { verdictIcon, verdictLabel, verdictTone } from "../verdicts.js";
import {
  banner,
  capacityRuleName,
  capacityRuleValue,
  narrativeCards,
  notRunNote,
  sectionHead
} from "./benchmarkParts.js";

/**
 * A capacity benchmark: its head, the narrative, and by verdict either the
 * latency chart with "At the limit" and the takeaway, what was measured
 * before the run stopped, or where its last result is.
 */
export function renderCapacitySection(
  benchmark: CapacityBenchmarkResult,
  index: number,
  ctx: PageContext
): string {
  const meta =
    benchmark.verdict === "not-run"
      ? ""
      : `${formatDuration(benchmark.durationS)} · ${benchmark.tool}`;
  const head = sectionHead(
    benchmark,
    index,
    meta,
    "",
    targetLabel(benchmark, ctx.report.run.infra)
  );

  const body = bodyFor(benchmark, ctx);

  return `<section class="bench" id="${esc(benchmark.id)}" aria-labelledby="${esc(benchmark.id)}-title">
<div class="wrap">
${head}
${body}
</div>
</section>`;
}

function bodyFor(benchmark: CapacityBenchmarkResult, ctx: PageContext): string {
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

function measured(benchmark: MeasuredCapacity): string {
  const { headline, stoppedBy, unit } = benchmark;
  const rate = (value: number) => formatRate(value, unit);
  const p99Rule = benchmark.rules.find((r) => r.id === "p99LatencyMs");
  const start =
    benchmark.series.steps[0]?.offeredCps ?? stoppedBy?.offeredCps ?? null;

  const failedSentence =
    headline.limitCps === null
      ? stoppedBy
        ? `Failed: no rate step met both rules. At ${rate(stoppedBy.offeredCps)}, ${capacityRuleName(stoppedBy.rule, unit)} was ${capacityRuleValue(stoppedBy.rule, stoppedBy.measured)} (limit: under ${capacityRuleValue(stoppedBy.rule, stoppedBy.limit)}).`
        : "Failed: no rate step met both rules."
      : `Failed: ${benchmark.rules
          .filter((r) => !r.passed)
          .map(
            (r) =>
              `${capacityRuleName(r.id, unit)} was ${capacityRuleValue(r.id, r.measured)} (limit: under ${capacityRuleValue(r.id, r.limit)})`
          )
          .join("; ")}.`;

  const takeaway =
    headline.limitCps === null
      ? `No rate step passed both rules, so there is no limit to report.`
      : headline.limitIsLowerBound
        ? `${benchmark.title} held every rate up to the highest tested, ${rate(headline.limitCps)}, without breaking a rule.`
        : stoppedBy
          ? `${benchmark.title} held ${rate(headline.limitCps)}. At ${rate(stoppedBy.offeredCps)} ${capacityRuleName(stoppedBy.rule, unit)} reached ${capacityRuleValue(stoppedBy.rule, stoppedBy.measured)} (limit: under ${capacityRuleValue(stoppedBy.rule, stoppedBy.limit)}), so the run stopped there.`
          : `${benchmark.title} held ${rate(headline.limitCps)}.`;

  const subtitle =
    headline.limitCps === null
      ? start === null
        ? "No limit: no rate step passed"
        : `Limit: below ${rate(start)}`
      : headline.limitIsLowerBound
        ? `Limit: at least ${rate(headline.limitCps)}, the highest rate tested`
        : `measured at ${rate(headline.limitCps)}`;

  const value = (v: number | null, format: (n: number) => string) =>
    v === null ? "--" : format(v);
  const rows: Array<[string, string]> = [
    ["p99 latency", value(headline.p99AtLimitMs, formatMs)],
    ["p50 latency", value(headline.p50AtLimitMs, formatMs)],
    [`Failed ${unit}`, value(headline.failedAtLimitPct, formatPct)],
    ["Retransmissions", value(headline.retransmissionsAtLimitPct, formatPct)]
  ];

  const chart = renderLatencyChart({
    steps: benchmark.series.steps,
    unit,
    thresholdMs: p99Rule?.limit ?? null,
    limit:
      headline.limitCps === null
        ? null
        : {
            cps: headline.limitCps,
            lowerBound: headline.limitIsLowerBound,
            p99Ms: headline.p99AtLimitMs
          },
    partial: false
  });

  return `${benchmark.verdict === "failed" ? banner("danger", verdictIcon("failed"), esc(failedSentence)) : ""}
${narrativeCards(benchmark)}
<div class="results">
${chart}
<div class="card card-surface side-card">
<h3 class="card-title">At the limit</h3>
<p class="card-sub">${esc(subtitle)}</p>
<dl class="rows">${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
<div class="takeaway">${icon("info", 16)}<p>${esc(takeaway)}</p></div>
</div>
</div>`;
}

function partial(benchmark: PartialCapacity): string {
  const label = verdictLabel(benchmark.verdict);
  const steps = benchmark.series?.steps ?? [];
  const lead =
    benchmark.verdict === "aborted"
      ? `Aborted after ${formatDuration(benchmark.durationS)}: ${benchmark.reason}.`
      : `Inconclusive: ${benchmark.reason}.`;
  const chartNote =
    steps.length > 0 && benchmark.verdict === "aborted"
      ? ` The chart shows the first ${formatDuration(benchmark.durationS)}.`
      : "";
  const sentence = `${lead} No limit is reported.${chartNote}`;
  const chart =
    steps.length > 0
      ? renderLatencyChart({
          steps,
          unit: benchmark.unit,
          thresholdMs: null,
          limit: null,
          partial: true
        })
      : "";
  return `${banner(verdictTone(benchmark.verdict), verdictIcon(benchmark.verdict), esc(sentence))}
${narrativeCards(benchmark)}
<div class="results${chart ? "" : " results-single"}">
${chart}
<div class="card card-surface side-card">
<h3 class="card-title">At the limit: not evaluated (run ${esc(label.toLowerCase())})</h3>
</div>
</div>`;
}
