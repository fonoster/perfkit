/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveCapacity, Step } from "../../schemas/index.js";
import { renderLatencyChart } from "../charts/renderLatencyChart.js";
import { formatDuration, formatNumber, formatRate } from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import { lastPublishedLimit } from "./lastPublishedLimit.js";
import { liveSectionHead } from "./liveSectionHead.js";
import type { LiveViewContext } from "./types.js";

/**
 * A capacity benchmark on the live page: the final report's "Latency as
 * load rises" chart drawn up to the step offered now, the steps not run
 * yet shaded, and "So far": what held, why the limit is not known yet, and
 * the last published result to compare with.
 */
export function renderLiveCapacity(
  benchmark: LiveCapacity,
  index: number,
  ctx: LiveViewContext
): string {
  const { unit, rate } = benchmark;
  const rateOf = (value: number) => formatRate(value, unit);
  const meta = `+${formatNumber(rate.step)} ${unit}/s every ${formatDuration(rate.everyS)} · ${rateOf(rate.start)} to ${rateOf(rate.max)}`;
  const head = liveSectionHead(benchmark, index, meta);
  if (benchmark.state === "queued") {
    return section(
      benchmark,
      `${head}
<p class="queued-note">Queued: this ramp starts when the benchmarks before it end.</p>`
    );
  }
  const steps: Step[] = benchmark.points.map((point) => ({
    offeredCps: point.offeredCps,
    achievedCps: point.achievedCps,
    calls: point.calls,
    p50Ms: point.p50Ms,
    p95Ms: point.p95Ms,
    p99Ms: point.p99Ms,
    failed: point.failed,
    failuresByReason: {},
    retransmissions: 0,
    sippCpuPct: 0,
    uutCpuPct: 0,
    loadgenUdpDrops: 0,
    uutUdpDrops: 0,
    valid: point.ok || point.stopReason === null
  }));
  const done = benchmark.state === "done";
  const held = benchmark.heldCps;
  const heldPoint = benchmark.points.find((p) => p.offeredCps === held);
  const chart = renderLatencyChart({
    steps,
    unit,
    thresholdMs: benchmark.thresholds.p99LatencyMs,
    limit:
      done && held !== null
        ? {
            cps: held,
            lowerBound: benchmark.result?.lowerBound ?? false,
            p99Ms: heldPoint?.p99Ms ?? null
          }
        : null,
    partial: false,
    ...(done
      ? {}
      : {
          live: {
            maxCps: rate.max,
            nowCps: benchmark.current?.offeredCps ?? rate.start
          }
        })
  });

  const passed = benchmark.points.filter((p) => p.ok).length;
  const value = done
    ? held === null
      ? "No step held"
      : `Held ${benchmark.result?.lowerBound ? "at least " : ""}${rateOf(held)}`
    : held === null
      ? "Nothing held yet"
      : `Held ${rateOf(held)} so far`;
  const sentence = done
    ? benchmark.result?.stopReason
      ? `The ramp stopped at ${rateOf(benchmark.points.find((p) => !p.ok)?.offeredCps ?? 0)}: ${benchmark.result.stopReason}. The verdict comes from the full analysis when the run is collected.`
      : "Every step passed up to the highest rate offered. The verdict comes from the full analysis when the run is collected."
    : `${passed === 0 ? "No step has finished yet." : `${passed} ${passed === 1 ? "step" : "steps"} passed both rules.`} The limit is the last step that passes before one fails; it is not known until the ramp stops.`;
  const last = lastPublishedLimit(ctx.runs, benchmark.id, ctx.live.runId);
  const baseline = last
    ? `Last published result: ${rateOf(last.limitCps)} on v${last.version}.${
        held === null
          ? ""
          : held >= last.limitCps
            ? " Already past it."
            : ` ${rateOf(last.limitCps - held)} to go to match it.`
      }`
    : null;
  return section(
    benchmark,
    `${head}
<div class="results">
${chart}
<div class="card card-surface side-card so-far">
<h3 class="card-title">${done ? "Where the ramp ended" : "So far"}</h3>
<p class="so-far-value">${esc(value)}</p>
<p>${esc(sentence)}</p>
${baseline ? `<div class="baseline">${icon("flag", 16)}<p>${esc(baseline)}</p></div>` : ""}
</div>
</div>`
  );
}

function section(benchmark: LiveCapacity, body: string): string {
  return `<section class="bench bench-live" id="${esc(benchmark.id)}" aria-labelledby="${esc(benchmark.id)}-title">
<div class="wrap">
${body}
</div>
</section>`;
}
