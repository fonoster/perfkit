/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { esc } from "../html.js";
import { livePhase } from "./livePhase.js";
import type { LiveViewContext } from "./types.js";

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten"
];

/**
 * The live header: "LIVE · RUN <id>", "<Project> <version> is under test
 * right now." and a lead that says how many benchmarks run, where, and
 * that nothing is final until the run ends.
 */
export function renderLiveHeader(ctx: LiveViewContext): string {
  const { live } = ctx;
  const phase = livePhase(live);
  const count = live.benchmarks.filter((b) => b.state !== "not-run").length;
  const where =
    live.provider === "local"
      ? "this machine's Docker"
      : "two dedicated DigitalOcean servers";
  const many = WORDS[count] ?? String(count);
  const lead =
    phase !== "running"
      ? count === 1
        ? `One benchmark ran on ${where}. The numbers below are still preliminary; the verdict comes with the published report.`
        : `${many} benchmarks ran one after another on ${where}. The numbers below are still preliminary; the verdicts come with the published report.`
      : count === 1
        ? `One benchmark runs on ${where}. Watch it as it happens; nothing on this page is final until the run ends.`
        : `${many} benchmarks run one after another on ${where}. Watch each one as it happens; nothing on this page is final until the run ends.`;
  const title =
    phase === "running"
      ? `${live.project.name} ${live.version} is under test right now.`
      : phase === "publishing"
        ? `${live.project.name} ${live.version} has finished its run.`
        : `${live.project.name} ${live.version}: the run stopped.`;
  return `<div class="hero hero-live">
<div class="wrap">
<p class="eyebrow eyebrow-live">${phase === "running" ? "LIVE" : "ENDED"} · RUN ${esc(live.runId.replace(/-[0-9a-f]+$/, ""))}</p>
<h1 class="title">${esc(title)}</h1>
<p class="lead">${esc(lead)}</p>
</div>
</div>`;
}
