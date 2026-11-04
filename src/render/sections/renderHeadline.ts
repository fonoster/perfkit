/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  BenchmarkResult,
  RunBenchmark,
  RunEntry
} from "../../schemas/index.js";
import { findEarlierResult } from "../findEarlierResult.js";
import {
  formatCount,
  formatDate,
  formatDuration,
  formatGrowth,
  formatMs,
  formatNumber,
  formatShortDate
} from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import type { PageContext } from "../types.js";
import { verdictLabel } from "../verdicts.js";

interface Delta {
  run: RunEntry;
  /** `50 messages/s more, better` */
  text: string;
  tone: "better" | "worse" | "same";
}

interface Cell {
  value: string;
  label: string;
  delta: Delta | null;
}

const MAX_CELLS = 4;

/**
 * The headline strip: up to four numbers in benchmark order, each with its
 * delta against the most recent earlier run that has the same number. When
 * every delta compares with the same run, one caption names it; otherwise
 * each delta names its own run.
 */
export function renderHeadline(ctx: PageContext): string {
  const cells = ctx.report.benchmarks
    .flatMap((benchmark) => cellsFor(benchmark, ctx))
    .slice(0, MAX_CELLS);
  const deltas = cells.flatMap((cell) => (cell.delta ? [cell.delta] : []));
  const sharedRun =
    deltas.length > 0 && deltas.every((d) => d.run.id === deltas[0]?.run.id)
      ? (deltas[0]?.run ?? null)
      : null;
  const hasEarlier = ctx.runs.some(
    (run) =>
      run.id !== ctx.current.id &&
      Date.parse(run.startedAt) < Date.parse(ctx.current.startedAt)
  );

  const caption = sharedRun
    ? `Compared with v${sharedRun.version}, ${formatDate(sharedRun.startedAt)}`
    : deltas.length > 0
      ? ""
      : hasEarlier
        ? "No earlier run has these numbers to compare with."
        : "First run: nothing to compare with yet.";

  const body = cells
    .map(
      (cell) => `<div class="stat">
<p class="stat-value">${esc(cell.value)}</p>
<p class="stat-label">${esc(cell.label)}</p>
${cell.delta ? renderDelta(cell.delta, sharedRun === null) : ""}
</div>`
    )
    .join("\n");

  return `<section class="headline" aria-label="Headline numbers">
<div class="wrap">
<div class="stats stats-${cells.length}">
${body}
</div>
${caption ? `<p class="headline-caption">${esc(caption)}</p>` : ""}
</div>
</section>`;
}

function renderDelta(delta: Delta, namesRun: boolean): string {
  const glyph =
    delta.tone === "same"
      ? "minus"
      : delta.text.includes(" more")
        ? "trending-up"
        : "trending-down";
  const suffix = namesRun
    ? ` vs v${delta.run.version}, ${formatShortDate(delta.run.startedAt)}`
    : "";
  return `<p class="delta delta-${delta.tone}">${icon(glyph, 14)}<span>${esc(delta.text + suffix)}</span></p>`;
}

function cellsFor(benchmark: BenchmarkResult, ctx: PageContext): Cell[] {
  const earlier = <T>(pick: (b: RunBenchmark) => T | null) =>
    findEarlierResult(ctx.runs, ctx.current, benchmark.id, pick);

  if (benchmark.kind === "capacity") {
    const limitLabel = `${benchmark.unit}/s, ${benchmark.title} limit`;
    if (benchmark.verdict !== "passed" && benchmark.verdict !== "failed") {
      const status = verdictLabel(benchmark.verdict);
      return [
        { value: "--", label: `${limitLabel} · ${status}`, delta: null },
        { value: "--", label: `p99 at the limit · ${status}`, delta: null }
      ];
    }
    const { headline } = benchmark;
    if (headline.limitCps === null || headline.p99AtLimitMs === null) {
      const start =
        benchmark.series.steps[0]?.offeredCps ??
        benchmark.stoppedBy?.offeredCps;
      return [
        {
          value: start === undefined ? "--" : `below ${formatNumber(start)}`,
          label: limitLabel,
          delta: null
        },
        { value: "--", label: "No passing step", delta: null }
      ];
    }
    const limit = headline.limitCps;
    const p99 = headline.p99AtLimitMs;
    const prevLimit = earlier((b) =>
      b.kind === "capacity" && b.headline ? b.headline.limitCps : null
    );
    const prevP99 = earlier((b) =>
      b.kind === "capacity" && b.headline ? b.headline.p99AtLimitMs : null
    );
    return [
      {
        value: headline.limitIsLowerBound
          ? `at least ${formatNumber(limit)}`
          : formatNumber(limit),
        label: limitLabel,
        delta: prevLimit
          ? delta(
              limit - prevLimit.value,
              `${benchmark.unit}/s`,
              true,
              prevLimit.run
            )
          : null
      },
      {
        value: formatMs(p99),
        label: "p99 at the limit",
        delta: prevP99
          ? delta(p99 - prevP99.value, "ms", false, prevP99.run)
          : null
      }
    ];
  }

  if (benchmark.verdict !== "passed" && benchmark.verdict !== "failed") {
    const status = verdictLabel(benchmark.verdict);
    return [
      { value: "--", label: `soak · ${status}`, delta: null },
      { value: "--", label: `memory growth · ${status}`, delta: null }
    ];
  }
  const growth = benchmark.headline.memoryGrowthMBPerHour;
  const prevGrowth = earlier((b) =>
    b.kind === "soak" && b.headline ? b.headline.memoryGrowthMBPerHour : null
  );
  return [
    {
      value: formatDuration(benchmark.durationS - benchmark.warmupS),
      label: `soak, ${formatCount(benchmark.headline.calls)} calls`,
      delta: null
    },
    {
      value: formatGrowth(growth),
      label: "memory growth after warm-up",
      delta: prevGrowth
        ? delta(growth - prevGrowth.value, "MB/h", false, prevGrowth.run)
        : null
    }
  ];
}

/** Says the change in words: how much, which way, and better or worse. */
function delta(
  diff: number,
  unit: string,
  higherIsBetter: boolean,
  run: RunEntry
): Delta {
  const amount = formatNumber(Math.abs(diff));
  if (amount === "0") return { run, text: "no change", tone: "same" };
  const more = diff > 0;
  const better = more === higherIsBetter;
  return {
    run,
    text: `${amount} ${unit} ${more ? "more" : "less"}, ${better ? "better" : "worse"}`,
    tone: better ? "better" : "worse"
  };
}
