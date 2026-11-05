/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatDuration, formatTime } from "../format.js";
import { esc } from "../html.js";
import { icon, type IconName } from "../icons.js";
import { describeStep } from "./describeStep.js";
import type { LiveViewContext } from "./types.js";

type StepState = "done" | "running" | "queued";

const ICONS: Record<StepState, IconName> = {
  done: "circle-check",
  running: "loader-circle",
  queued: "circle-dashed"
};

/**
 * The progress cards (setup, then each benchmark of the run: done, running
 * or queued) and the overall bar with when the run should end.
 */
export function renderLiveProgress(ctx: LiveViewContext): string {
  const { live, nowMs } = ctx;
  const selected = live.benchmarks.filter((b) => b.state !== "not-run");
  const firstStart =
    selected.find((b) => b.startedAt !== null)?.startedAt ?? null;
  const setupState: StepState =
    firstStart === null && live.status === "running" ? "running" : "done";
  const machines = live.provider === "local" ? "containers up" : "servers up";
  const setupSub =
    firstStart === null
      ? `${machines}, images pinned`
      : `${machines}, images pinned · ${formatDuration((Date.parse(firstStart) - Date.parse(live.startedAt)) / 1000)}`;
  const card = (state: StepState, title: string, sub: string) =>
    `<li class="step step-${state}"><p class="step-title">${icon(ICONS[state], 16)}<span>${esc(title)}</span><span class="visually-hidden">, ${state}</span></p><p class="step-sub">${esc(sub)}</p></li>`;
  const cards = [
    card(setupState, "Setup", setupSub),
    ...selected.map((b) =>
      card(b.state === "not-run" ? "queued" : b.state, b.title, describeStep(b))
    )
  ].join("");

  const startMs = Date.parse(live.startedAt);
  const endMs = live.estimatedEndAt
    ? Date.parse(live.estimatedEndAt)
    : Date.parse(live.updatedAt);
  const pct =
    live.status === "running"
      ? Math.min(
          99,
          Math.max(
            0,
            Math.floor(((nowMs - startMs) / Math.max(1, endMs - startMs)) * 100)
          )
        )
      : 100;
  const text =
    live.status === "running"
      ? `${pct}% · ends about ${formatTime(new Date(endMs).toISOString())} UTC`
      : `ended ${formatTime(live.updatedAt)} UTC`;
  return `<div class="progress">
<div class="wrap">
<ol class="steps" aria-label="Progress of the run">${cards}</ol>
<div class="overall"><div class="track" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="track-done" style="width:${pct}%"></div></div><p class="overall-text">${esc(text)}</p></div>
</div>
</div>`;
}
