/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { buildLiveSnapshot } from "../../src/live/buildLiveSnapshot.js";
import type { Live } from "../../src/schemas/index.js";
import {
  CAPACITY,
  MIN,
  point,
  record,
  runState,
  SOAK,
  STARTED_MS
} from "./state.js";

/** A snapshot of the Routr example: the ramp done, the soak 40 min in. */
export function sampleLive(nowMs = STARTED_MS + 150 * MIN): Live {
  const soakLoad = STARTED_MS + 105 * MIN;
  const samples = Array.from({ length: 241 }, (_, i) => ({
    name: "one",
    tMs: soakLoad + i * 10_000,
    rssKB: 200 * 1024 + i * 10
  }));
  return buildLiveSnapshot({
    state: runState(),
    record: record({
      [CAPACITY.id]: {
        startedMs: STARTED_MS + 2 * MIN,
        loadStartedMs: STARTED_MS + 3 * MIN,
        endedMs: STARTED_MS + 100 * MIN,
        points: [point(50), point(100), point(150, false)]
      },
      [SOAK.id]: { startedMs: STARTED_MS + 101 * MIN, loadStartedMs: soakLoad }
    }),
    nowMs,
    soaks: new Map([[SOAK.id, { samples, placed: 270_000, failed: 12 }]])
  });
}
