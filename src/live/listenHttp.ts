/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { createServer } from "node:http";
import type { LiveRequest, LiveResponse } from "./handleLiveRequest.schema.js";

export interface HttpServer {
  /** The port it listens on: the one asked for, or a free one for 0. */
  port: number;
  close(): Promise<void>;
}

/**
 * Serves `handle` with node:http on `host:port`. A handler that throws
 * answers 500. Resolves once it listens; rejects when it can't (the port
 * is taken).
 */
export function listenHttp(
  handle: (request: LiveRequest) => Promise<LiveResponse>,
  options: { port: number; host: string }
): Promise<HttpServer> {
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    handle({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      origin: typeof origin === "string" ? origin : null
    })
      .catch(() => ({
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: "error\n"
      }))
      .then((response) => {
        res.writeHead(response.status, response.headers);
        res.end(response.body);
      });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve({
        port:
          typeof address === "object" && address ? address.port : options.port,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          })
      });
    });
  });
}
