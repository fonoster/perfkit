/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Live, RunEntry } from "../../schemas/index.js";

/** Everything the live view is drawn from. */
export interface LiveViewContext {
  live: Live;
  /** The published history, newest first; empty when there is none. */
  runs: RunEntry[];
  nowMs: number;
  /** lost: the last poll failed, or the snapshot is over 3 minutes old. */
  connection: "ok" | "lost";
  /** The perfkit version of the app, for the footer. */
  perfkitVersion: string;
}

/** The parts the app replaces on each poll, apart from the nav. */
export interface LiveViewParts {
  nav: string;
  banner: string;
  main: string;
  footer: string;
}
