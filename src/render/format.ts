/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * How the page writes numbers, durations and dates. Dates are always UTC,
 * in English, so a page reads the same wherever it is rendered.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

/** `1,240`, `1,140.8`; at most `digits` decimals. */
export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  });
}

/** `1,240 messages/s`: a rate in the benchmark's unit. */
export function formatRate(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}/s`;
}

/** `38 ms`, `30.9 ms` */
export function formatMs(value: number): string {
  return `${formatNumber(value)} ms`;
}

/** `0.04%` */
export function formatPct(value: number): string {
  return `${formatNumber(value, 2)}%`;
}

/** `+0.3 MB/h`, `-0.1 MB/h` */
export function formatGrowth(value: number): string {
  return `${value < 0 ? "-" : "+"}${formatNumber(Math.abs(value))} MB/h`;
}

/** `2.2M`, `151K`, `3,010` */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000)}M`;
  if (value >= 10_000) return `${formatNumber(value / 1000, 0)}K`;
  return formatNumber(value, 0);
}

/** `45 s`, `26 min`, `6 h`, `3 h 12 min` */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** `Nov 3, 2026` */
export function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** `Oct 19` */
export function formatShortDate(timestamp: string): string {
  const date = new Date(timestamp);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** `14:12` */
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** `Nov 3, 2026 · 14:12 UTC` */
export function formatRanAt(timestamp: string): string {
  return `${formatDate(timestamp)} · ${formatTime(timestamp)} UTC`;
}

/** The first 7 characters of a commit sha. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** `1 run`, `14 runs` */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
