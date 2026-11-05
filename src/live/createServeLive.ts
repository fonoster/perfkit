/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import type { HttpServer } from "./listenHttp.js";
import type { LiveRequest, LiveResponse } from "./handleLiveRequest.schema.js";
import {
  type ServeLiveInput,
  serveLiveInputSchema
} from "./serveLive.schema.js";
import type { StartLiveTunnelInput } from "./startLiveTunnel.schema.js";
import type { Closable } from "./types.js";

/**
 * Creates `serveLive`: the read-only live.json server on `host:port`
 * and, with an ngrok token, a tunnel to it, whose public URL it logs. A
 * port that is taken or a tunnel that fails is logged and the run goes on:
 * live.json is a convenience, never a reason to stop a benchmark. The token
 * is never logged.
 *
 * @param deps - The request handler, the HTTP listener, the tunnel and the
 *   log (injected)
 * @returns A validated function that returns what to close at the end
 */
export function createServeLive(deps: {
  handle: (request: LiveRequest) => Promise<LiveResponse>;
  listen: (
    handle: (request: LiveRequest) => Promise<LiveResponse>,
    options: { port: number; host: string }
  ) => Promise<HttpServer>;
  startTunnel: (
    input: StartLiveTunnelInput
  ) => Promise<{ url: string } & Closable>;
  log: (line: string) => Promise<void>;
}) {
  const fn = async (input: ServeLiveInput): Promise<Closable> => {
    const message = (err: unknown) =>
      err instanceof Error ? err.message : String(err);
    const server = await deps
      .listen(deps.handle, { port: input.port, host: input.host })
      .catch(async (err: unknown) => {
        await deps.log(
          `perfkit: live.json not served on ${input.host}:${input.port}: ${message(err)}`
        );
        return null;
      });
    if (server === null) return { close: async () => {} };
    await deps.log(
      `perfkit: live.json at http://${input.host}:${server.port}/live.json`
    );
    const tunnel =
      input.token === null
        ? null
        : await deps
            .startTunnel({
              token: input.token,
              domain: input.domain,
              port: server.port
            })
            .catch(async (err: unknown) => {
              await deps.log(
                `perfkit: no live tunnel: ${message(err)
                  .split(input.token ?? "")
                  .join("***")}`
              );
              return null;
            });
    if (tunnel) await deps.log(`perfkit: live.json at ${tunnel.url}/live.json`);
    return {
      close: async () => {
        await tunnel?.close().catch(() => {});
        await server.close();
      }
    };
  };
  return withErrorHandlingAndValidation(fn, serveLiveInputSchema);
}
