/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFile } from "node:fs/promises";
import { createHandleLiveRequest } from "./createHandleLiveRequest.js";
import { createServeLive } from "./createServeLive.js";
import { createStartLiveTunnel } from "./createStartLiveTunnel.js";
import { listenHttp } from "./listenHttp.js";
import type { NgrokForward } from "./startLiveTunnel.schema.js";

/**
 * `serveLive` for a live.json file on this machine, with node:http and the
 * @ngrok/ngrok package, loaded only when a tunnel is asked for: its native
 * binding may be missing on the agent's platform, which means no tunnel.
 */
export function createNodeServeLive(input: {
  file: string;
  siteUrl: string;
  log: (line: string) => Promise<void>;
}) {
  const forward: NgrokForward = async (config) => {
    const ngrok = await import("@ngrok/ngrok");
    return ngrok.forward(config);
  };
  return createServeLive({
    handle: createHandleLiveRequest({
      readLive: () => readFile(input.file, "utf8").catch(() => null),
      siteUrl: input.siteUrl
    }),
    listen: listenHttp,
    startTunnel: createStartLiveTunnel({ forward }),
    log: input.log
  });
}
