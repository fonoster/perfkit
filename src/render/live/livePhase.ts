/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Live } from "../../schemas/index.js";

/**
 * running while the run goes on; publishing once it finished, until the
 * report is on the site; stopped when the agent stopped it.
 */
export function livePhase(live: Live): "running" | "publishing" | "stopped" {
  if (live.status === "running") return "running";
  return live.status === "finished" ? "publishing" : "stopped";
}
