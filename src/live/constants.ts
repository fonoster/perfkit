/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** The agent's live.json server listens on this port by default. */
export const LIVE_DEFAULT_PORT = 8787;
/** And on this address: the tunnel reaches it on the same machine. */
export const LIVE_DEFAULT_HOST = "127.0.0.1";
/** A benchmark's start (compose up, healthy, setup) and end, estimated. */
export const BENCHMARK_OVERHEAD_S = 90;
/** After the run ends the agent keeps serving this long, so pages see it. */
export const LIVE_LINGER_MS = 30 * 1000;
