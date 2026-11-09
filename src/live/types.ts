/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LivePoint } from "../schemas/index.js";

/** What the agent has recorded about one benchmark so far. */
export interface LiveBenchmarkRecord {
  /** When the agent started it (compose up), in ms. */
  startedMs: number | null;
  /** When SIPp started placing calls, in ms. */
  loadStartedMs: number | null;
  /** When it ended, in ms. */
  endedMs: number | null;
  /** The capacity steps evaluated so far. */
  points: LivePoint[];
  /** A soak's rate, once the agent resolved `rate.fromCapacity`. */
  cps?: number;
}

/** What the agent has recorded about the run so far. */
export interface LiveRecord {
  status: "running" | "finished" | "failed";
  reason: string | null;
  benchmarks: Record<string, LiveBenchmarkRecord>;
}

/**
 * The agent's notes for live.json: the agent and each benchmark call it as
 * things happen; the live writer reads it every 15 seconds.
 */
export interface LiveRecorder {
  started(id: string, ms: number): void;
  loadStarted(id: string, ms: number): void;
  point(id: string, point: LivePoint): void;
  /** A soak's calls per second, resolved from `rate.fromCapacity`. */
  rate?(id: string, cps: number): void;
  done(id: string, ms: number): void;
  finished(): void;
  failed(reason: string): void;
  /** A copy of everything recorded so far. */
  read(): LiveRecord;
}

/** A soak's progress read from its raw files. */
export interface SoakProgress {
  /** The UUT's samples, as parseSamplerJsonl returns them. */
  samples: ReadonlyArray<{ name: string; tMs: number; rssKB: number }>;
  placed: number;
  failed: number;
}

/** A started server or tunnel, closed when the run ends. */
export interface Closable {
  close(): Promise<void>;
}
