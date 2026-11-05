/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveBenchmark } from "../../schemas/index.js";
import { esc } from "../html.js";

/** `02 · CAPACITY · RUNNING`, the title and a meta line. */
export function liveSectionHead(
  benchmark: LiveBenchmark,
  index: number,
  meta: string
): string {
  const number = String(index + 1).padStart(2, "0");
  return `<div class="section-head">
<div class="section-head-main">
<p class="eyebrow">${number} · ${esc(benchmark.kind.toUpperCase())} · ${esc(benchmark.state.toUpperCase())}</p>
<h2 id="${esc(benchmark.id)}-title" class="section-title">${esc(benchmark.title)}</h2>
</div>
${meta ? `<p class="section-meta">${esc(meta)}</p>` : ""}
</div>`;
}
