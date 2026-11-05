/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { esc } from "../html.js";
import { icon } from "../icons.js";
import { formatUpdated } from "./formatUpdated.js";
import { livePhase } from "./livePhase.js";
import type { LiveViewContext } from "./types.js";

/**
 * The banner under the nav: the numbers are preliminary, and how fresh
 * they are ("updated N s ago", which the app keeps ticking); once the run
 * ends, that its report is being published, or why it stopped.
 */
export function renderLiveBanner(ctx: LiveViewContext): string {
  const { live } = ctx;
  const phase = livePhase(live);
  const sentence =
    phase === "running"
      ? "Running now. These numbers are preliminary and change every 15 seconds; the verdict appears when the run ends."
      : phase === "publishing"
        ? "Run finished; the report is being published. This page shows it as soon as it is on the site."
        : `The run stopped: ${live.reason ?? "the agent failed"}. Any results are published once the run is collected.`;
  const updated = formatUpdated(live.updatedAt, ctx.nowMs, ctx.connection);
  return `<div class="live-banner" role="status"><div class="wrap"><p>${icon("radio", 16)}<span>${esc(sentence)}</span></p><span class="updated is-${updated.tone}" data-updated="${esc(live.updatedAt)}">${esc(updated.text)}</span></div></div>`;
}
