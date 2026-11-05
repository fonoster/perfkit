/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  type LiveRequest,
  liveRequestSchema,
  type LiveResponse
} from "./handleLiveRequest.schema.js";
import { isAllowedOrigin } from "./isAllowedOrigin.js";

export const LIVE_PATH = "/live.json";

/**
 * Creates the live.json server's request handler. `GET /live.json` answers
 * the latest snapshot (503 before the first one), never cached; `OPTIONS`
 * answers the CORS preflight. A page on the project's site or on this
 * machine may read it, and may send `ngrok-skip-browser-warning`, which
 * ngrok's free domains need. Anything else is 404.
 *
 * @param deps - Reads the latest live.json, null before the first one;
 *   and the project's site URL (injected)
 */
export function createHandleLiveRequest(deps: {
  readLive: () => Promise<string | null>;
  siteUrl: string;
}) {
  const fn = async (request: LiveRequest): Promise<LiveResponse> => {
    const path = request.url.split("?")[0];
    const cors: Record<string, string> =
      request.origin !== null && isAllowedOrigin(request.origin, deps.siteUrl)
        ? {
            "Access-Control-Allow-Origin": request.origin,
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "ngrok-skip-browser-warning",
            "Access-Control-Max-Age": "600"
          }
        : {};
    const base = { "Cache-Control": "no-store", Vary: "Origin", ...cors };
    const text = (status: number, body: string) => ({
      status,
      headers: { ...base, "Content-Type": "text/plain; charset=utf-8" },
      body
    });
    if (path !== LIVE_PATH) return text(404, "not found\n");
    if (request.method === "OPTIONS") {
      return { status: 204, headers: base, body: "" };
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text(404, "not found\n");
    }
    const live = await deps.readLive().catch(() => null);
    if (live === null) return text(503, "no snapshot yet\n");
    return {
      status: 200,
      headers: { ...base, "Content-Type": "application/json; charset=utf-8" },
      body: request.method === "HEAD" ? "" : live
    };
  };

  return withErrorHandlingAndValidation(fn, liveRequestSchema);
}
