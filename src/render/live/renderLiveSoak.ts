/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveSoak } from "../../schemas/index.js";
import { renderMemoryChart } from "../charts/renderMemoryChart.js";
import { formatCount, formatDuration, formatNumber } from "../format.js";
import { esc } from "../html.js";
import { liveSectionHead } from "./liveSectionHead.js";
import type { LiveViewContext } from "./types.js";

export const GROWTH_NOTE =
  "Memory growth per hour appears once there is a full hour of data after the warm-up. Until then the page shows the raw curve only, because a slope over a few minutes overstates growth while the heap settles.";

/**
 * A soak on the live page: how far it is and its calls so far, and the
 * raw memory per process with the warm-up shaded and a "now" line. MB/h
 * shows only once a full hour after the warm-up is in.
 */
export function renderLiveSoak(
  benchmark: LiveSoak,
  index: number,
  _ctx: LiveViewContext
): string {
  const { unit } = benchmark;
  const meta =
    benchmark.state === "queued"
      ? `${formatDuration(benchmark.durationS)} + ${formatDuration(benchmark.warmupS)} warm-up · steady ${formatNumber(benchmark.cps)} ${unit}/s`
      : `${formatDuration(benchmark.elapsedS)} of ${formatDuration(benchmark.plannedS)} · ${formatCount(benchmark.calls.placed)} ${unit} · ${formatCount(benchmark.calls.failed)} failed`;
  const head = liveSectionHead(benchmark, index, meta);
  const processes = benchmark.memory
    .filter((p) => p.samples.length > 0)
    .map((p) => ({
      name: p.name,
      samples: p.samples.map((s) => ({
        t: s.t,
        rssMB: s.rssMB,
        cpuPct: 0,
        fds: 0,
        pid: 1
      }))
    }));
  const growth = new Map(
    benchmark.memory.flatMap((p) =>
      p.growthMBPerHour === null
        ? []
        : [[p.name, p.growthMBPerHour] as [string, number]]
    )
  );
  const body =
    benchmark.state === "queued"
      ? `<p class="queued-note">Queued: this soak starts when the benchmarks before it end.</p>`
      : processes.length === 0 || benchmark.loadStartedAt === null
        ? `<div class="card card-surface"><h3 class="card-title">Memory per process, raw</h3><p class="empty-chart">The first memory samples appear within a minute of the load starting.</p></div>`
        : renderMemoryChart({
            processes,
            durationS: benchmark.plannedS,
            warmupS: benchmark.warmupS,
            growth,
            partial: false,
            live: {
              startMs: Date.parse(benchmark.loadStartedAt),
              nowS: benchmark.state === "done" ? null : benchmark.elapsedS,
              note: benchmark.memory.some((p) => p.growthMBPerHour === null)
                ? GROWTH_NOTE
                : null
            }
          });
  return `<section class="bench bench-live bench-sunken" id="${esc(benchmark.id)}" aria-labelledby="${esc(benchmark.id)}-title">
<div class="wrap">
${head}
${body}
</div>
</section>`;
}
