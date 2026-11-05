/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * How the run summary writes Markdown and numbers. It is plain GitHub
 * Markdown, for $GITHUB_STEP_SUMMARY, so it shares nothing with the HTML
 * page's formatting.
 */
import type { Verdict } from "../schemas/index.js";

const LABELS: Record<Verdict, string> = {
  passed: "passed",
  failed: "failed",
  inconclusive: "inconclusive",
  aborted: "aborted",
  "not-run": "not run"
};

/** `passed`, `not run` */
export function verdictWord(verdict: Verdict): string {
  return LABELS[verdict];
}

/** `Not run` */
export function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Text safe inside a table cell or a heading: no pipes, no line breaks. */
export function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

/** `1,240`, `0.03`; at most `digits` decimals. */
export function num(value: number, digits = 1): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  });
}

/** `0.03%` */
export function pct(value: number): string {
  return `${num(value, 2)}%`;
}

/** `+7.4 MB/h` */
export function growth(value: number): string {
  return `${value < 0 ? "-" : "+"}${num(Math.abs(value))} MB/h`;
}

/** `45 s`, `26 min`, `6 h 30 min` */
export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

/** A GitHub Markdown table; numeric columns are right-aligned. */
export function table(
  header: string[],
  rows: string[][],
  right: boolean[]
): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(header),
    line(right.map((r) => (r ? "---:" : ":---"))),
    ...rows.map(line)
  ].join("\n");
}
