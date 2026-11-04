/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Verdict, VerdictSummary } from "../schemas/index.js";
import { esc } from "./html.js";
import { icon, type IconName } from "./icons.js";

export type Tone = "success" | "danger" | "warning" | "neutral";

const LABELS: Record<Verdict, string> = {
  passed: "Passed",
  failed: "Failed",
  inconclusive: "Inconclusive",
  aborted: "Aborted",
  "not-run": "Not run"
};

const TONES: Record<Verdict, Tone> = {
  passed: "success",
  failed: "danger",
  inconclusive: "warning",
  aborted: "neutral",
  "not-run": "neutral"
};

const ICONS: Record<Verdict, IconName> = {
  passed: "circle-check",
  failed: "circle-x",
  inconclusive: "circle-help",
  aborted: "ban",
  "not-run": "circle-dashed"
};

/** `Passed`, `Failed`, `Inconclusive`, `Aborted`, `Not run` */
export function verdictLabel(verdict: Verdict): string {
  return LABELS[verdict];
}

export function verdictTone(verdict: Verdict): Tone {
  return TONES[verdict];
}

export function verdictIcon(verdict: Verdict): IconName {
  return ICONS[verdict];
}

/** A benchmark's status pill: icon and word, in the verdict's tone. */
export function verdictPill(verdict: Verdict): string {
  return `<span class="pill pill-${TONES[verdict]}">${icon(ICONS[verdict], 14)}${esc(LABELS[verdict])}</span>`;
}

/** Green when all passed, red when any failed, amber otherwise. */
export function summaryTone(summary: VerdictSummary): Tone {
  if (summary.failed > 0) return "danger";
  if (summary.passed === summary.total) return "success";
  return "warning";
}

export function summaryIcon(summary: VerdictSummary): IconName {
  const tone = summaryTone(summary);
  if (tone === "success") return "circle-check";
  if (tone === "danger") return "circle-x";
  return "circle-help";
}

/**
 * `2 of 2 benchmarks passed`, `1 of 1 benchmark passed`, `1 of 2 benchmarks
 * passed · 1 not run`. With `short`, `2 of 2 passed`.
 */
export function summaryText(summary: VerdictSummary, short = false): string {
  const noun = short ? "" : summary.total === 1 ? " benchmark" : " benchmarks";
  const extras = [
    [summary.notRun, "not run"],
    [summary.aborted, "aborted"],
    [summary.inconclusive, "inconclusive"]
  ] as const;
  return [
    `${summary.passed} of ${summary.total}${noun} passed`,
    ...extras.filter(([count]) => count > 0).map(([n, w]) => `${n} ${w}`)
  ].join(" · ");
}
