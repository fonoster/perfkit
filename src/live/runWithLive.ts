/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Closable } from "./types.js";

/**
 * Runs `body` (the agent) while live.json is written every `intervalMs`
 * and served: one write right away, one per interval, and a last one when
 * the body ends, after which the server stays up `lingerMs` so open pages
 * see the run end, then closes. A failed write is skipped; the body's
 * result or error is passed through.
 */
export async function runWithLive<T>(
  deps: {
    writeLive: () => Promise<unknown>;
    serve: () => Promise<Closable>;
    sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
    intervalMs: number;
    lingerMs: number;
  },
  body: () => Promise<T>
): Promise<T> {
  const write = () => deps.writeLive().catch(() => undefined);
  const stop = new AbortController();
  const loop = async (): Promise<void> => {
    await write();
    await deps.sleep(deps.intervalMs, stop.signal);
    if (!stop.signal.aborted) return loop();
  };
  const service = await deps.serve().catch(() => ({ close: async () => {} }));
  const writing = loop();
  try {
    return await body();
  } finally {
    stop.abort();
    await writing;
    await write();
    await deps.sleep(deps.lingerMs);
    await service.close().catch(() => {});
  }
}
