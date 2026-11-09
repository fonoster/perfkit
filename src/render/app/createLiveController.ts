/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />
import type { Live, RunEntry } from "../../schemas/index.js";
import { parseLiveTolerant } from "./parseLiveTolerant.js";
import type { LiveViewContext } from "../live/types.js";
import type { LiveControllerDeps, LiveMode } from "./liveController.types.js";

/**
 * Creates the latest page's live controller. Each `poll()` fetches
 * live.json: a run in progress turns the page live (and redraws it); when
 * that run finishes or stops, the page says so and waits for its report in
 * data/runs.json, then draws it. A failed poll while live shows "connection
 * lost, retrying" and keeps looking for the report. With no run in
 * progress (fetch fails, 503, an invalid file, or a run that ended before
 * the page saw it live) the published report stays as it is.
 */
export function createLiveController(deps: LiveControllerDeps) {
  let mode: LiveMode = "final";
  let live: Live | null = null;
  let runs: RunEntry[] = [];
  let failing = false;
  let mounted: string | null = null;

  const context = (): LiveViewContext => ({
    live: live as Live,
    runs,
    nowMs: deps.now(),
    connection: failing ? "lost" : "ok",
    perfkitVersion: deps.version
  });

  const draw = () => {
    if (!live) return;
    deps.view.showLive(context(), mounted !== live.runId);
    mounted = live.runId;
  };

  const read = async (): Promise<Live | null> => {
    try {
      const response = await deps.fetchLive(deps.liveUrl);
      if (response.status !== 200) return null;
      return parseLiveTolerant(JSON.parse(response.text));
    } catch {
      return null;
    }
  };

  const refreshRuns = async () => {
    const fresh = await deps.fetchRuns().catch(() => null);
    if (fresh) runs = fresh;
    return fresh;
  };

  /** Draws the final report once the run being watched is published. */
  const checkPublished = async (runId: string) => {
    const fresh = await refreshRuns();
    if (!fresh?.some((run) => run.id === runId)) return false;
    mode = "final";
    live = null;
    mounted = null;
    failing = false;
    await deps.view.showFinal();
    return true;
  };

  const poll = async (): Promise<LiveMode> => {
    const next = await read();
    if (next) {
      failing = false;
      if (next.status === "running") {
        if (mode === "final" || live?.runId !== next.runId) await refreshRuns();
        mode = "live";
        live = next;
        draw();
      } else if (mode === "live") {
        live = next;
        draw();
        await checkPublished(next.runId);
      }
      return mode;
    }
    if (mode === "live" && live) {
      failing = true;
      draw();
      await checkPublished(live.runId);
    }
    return mode;
  };

  const tick = () => {
    if (mode === "live" && live) deps.view.tick(context());
  };

  return { poll, tick, mode: () => mode };
}
