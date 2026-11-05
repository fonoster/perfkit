/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { request } from "node:http";
import nock from "nock";
import { listenHttp } from "../../src/live/listenHttp.js";

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{
    status: number;
    headers: Record<string, unknown>;
    body: string;
  }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

describe("listenHttp", () => {
  before(() => nock.enableNetConnect("127.0.0.1"));
  after(() => nock.disableNetConnect());

  it("should serve the handler's responses on a local port and close", async () => {
    // Arrange
    const server = await listenHttp(
      async (req) => ({
        status: 200,
        headers: { "X-Origin": req.origin ?? "none" },
        body: `${req.method} ${req.url}`
      }),
      { port: 0, host: "127.0.0.1" }
    );

    // Act
    const response = await get(server.port, "/live.json", {
      Origin: "http://localhost:1"
    });
    await server.close();

    // Assert
    expect(response.status).to.equal(200);
    expect(response.body).to.equal("GET /live.json");
    expect(response.headers["x-origin"]).to.equal("http://localhost:1");
  });

  it("should answer 500 when the handler throws", async () => {
    const server = await listenHttp(
      async () => {
        throw new Error("boom");
      },
      { port: 0, host: "127.0.0.1" }
    );
    const response = await get(server.port, "/");
    await server.close();
    expect(response.status).to.equal(500);
  });

  it("should reject when the port is taken", async () => {
    const first = await listenHttp(
      async () => ({ status: 200, headers: {}, body: "" }),
      {
        port: 0,
        host: "127.0.0.1"
      }
    );
    let error: unknown;
    await listenHttp(async () => ({ status: 200, headers: {}, body: "" }), {
      port: first.port,
      host: "127.0.0.1"
    }).catch((err: unknown) => {
      error = err;
    });
    await first.close();
    expect(error).to.be.instanceOf(Error);
  });
});
