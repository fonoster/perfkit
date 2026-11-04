/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** File system access the analyzers need, injected so tests can fake it. */
export interface AnalyzeDeps {
  /** Reads a UTF-8 file. Rejects when it does not exist. */
  readFile: (path: string) => Promise<string>;
  /**
   * Reads a UTF-8 file one line at a time, for files too large for one
   * string (spans.jsonl passes 512 MB in an hour). Without it, analyzers
   * fall back to `readFile`.
   */
  readLines?: (path: string) => AsyncIterable<string>;
  /** Lists the names in a directory. Rejects when it does not exist. */
  readdir: (path: string) => Promise<string[]>;
}

/** A time window, in ms since the epoch: `fromMs` included, `toMs` not. */
export interface TimeWindow {
  fromMs: number;
  toMs: number;
}

/** One row of a SIPp `-trace_stat` file. */
export interface StatRow {
  /** The row's CurrentTime, ms since the epoch. */
  tMs: number;
  /** Where the row's periodic (P) counters start: the previous row's time. */
  periodStartMs: number;
  /** Every numeric column, by its header name, like `OutgoingCall(P)`. */
  counters: Record<string, number>;
}

/** A SIPp `-trace_stat` file. */
export interface StatTrace {
  /** SIPp's StartTime, ms since the epoch; `-trace_rtt` times count from it. */
  startMs: number;
  rows: StatRow[];
}

/** One row of a SIPp `-trace_rtt` file. */
export interface RttRow {
  /** When the rtd stopped, in ms since SIPp started. */
  atMs: number;
  /** The rtd's time, ms. */
  responseTimeMs: number;
  /** The rtd number. */
  rtd: number;
}

/** One measured request: when it was sent and how long its 200 OK took. */
export interface Call {
  sentMs: number;
  latencyMs: number;
}

/** What one SIPp instance wrote: its stat rows and its rtd 1 calls. */
export interface SippResults {
  rows: StatRow[];
  calls: Call[];
}

/** One sampler reading of one process name, with duplicates summed. */
export interface ProcessSample {
  t: string;
  tMs: number;
  host: "uut" | "loadgen";
  name: string;
  pid: number;
  rssKB: number;
  cpuTicks: number;
  clkTck: number;
  fds: number;
}

/** One UDP counters reading. `drops` is RcvbufErrors + SndbufErrors. */
export interface UdpSample {
  tMs: number;
  host: "uut" | "loadgen";
  drops: number;
}

/** One span from an OTLP JSON export, with its service already resolved. */
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  startMs: number;
  durationMs: number;
}
