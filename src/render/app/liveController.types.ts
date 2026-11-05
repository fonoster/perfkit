/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunEntry } from "../../schemas/index.js";
import type { LiveViewContext } from "../live/types.js";

/** How the live controller reaches the page and the network, injected. */
export interface LiveControllerDeps {
  /** The live.json URL to poll. */
  liveUrl: string;
  /** The perfkit version of the app, for the footer. */
  version: string;
  /** Fetches live.json; rejects on a network error. */
  fetchLive: (url: string) => Promise<{ status: number; text: string }>;
  /** The published history, newest first; null when it can't be read. */
  fetchRuns: () => Promise<RunEntry[] | null>;
  view: {
    /** Draws the live view: a whole page when `first`, else in place. */
    showLive: (ctx: LiveViewContext, first: boolean) => void;
    /** Refreshes "updated N s ago" only. */
    tick: (ctx: LiveViewContext) => void;
    /** Draws the latest published report, as the page does without live. */
    showFinal: () => Promise<void>;
  };
  now: () => number;
}

/** What the page shows: the published report, or a run in progress. */
export type LiveMode = "final" | "live";
