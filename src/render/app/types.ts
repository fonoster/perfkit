/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** What the browser app needs from the outside world, injected. */
export interface DrawRunDeps {
  /** The perfkit version of the app, for the footer. */
  version: string;
  /**
   * Fetches a file by its path relative to the site root, like
   * `data/runs.json`; rejects on a network error.
   */
  fetchText: (path: string) => Promise<{ status: number; text: string }>;
}

export type DrawRunResult =
  | {
      ok: true;
      /** The run drawn; null for the latest page of a site with no runs. */
      runId: string | null;
      html: string;
      /** The project's live.json URL from the report (or site.json), or null. */
      liveUrl: string | null;
    }
  | { ok: false; errors: string[] };
