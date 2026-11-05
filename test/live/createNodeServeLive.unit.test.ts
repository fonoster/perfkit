/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtemp, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nock from "nock";
import { createNodeServeLive } from "../../src/live/createNodeServeLive.js";

function get(
  url: string,
  method = "GET",
  headers: Record<string, string> = {}
) {
  return new Promise<{
    status: number;
    body: string;
    headers: Record<string, unknown>;
  }>((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body, headers: res.headers })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

describe("createNodeServeLive", () => {
  before(() => nock.enableNetConnect("127.0.0.1"));
  after(() => nock.disableNetConnect());

  it("should serve a live.json file on this machine, 503 before it exists, and log where", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "perfkit-live-"));
    const file = join(dir, "live.json");
    const log: string[] = [];
    const serveLive = createNodeServeLive({
      file,
      siteUrl: "https://fonoster.github.io/routr/benchmarks",
      log: async (line) => {
        log.push(line);
      }
    });

    // Act
    const service = await serveLive({
      siteUrl: "https://fonoster.github.io/routr/benchmarks",
      port: 0,
      host: "127.0.0.1",
      token: null,
      domain: null
    });
    const port = /:(\d+)\/live\.json$/.exec(log[0] ?? "")?.[1];
    const before = await get(`http://127.0.0.1:${port}/live.json`);
    await writeFile(file, '{"schema":"perfkit/live/v1"}');
    const after = await get(`http://127.0.0.1:${port}/live.json`, "GET", {
      Origin: "https://fonoster.github.io"
    });
    const preflight = await get(
      `http://127.0.0.1:${port}/live.json`,
      "OPTIONS",
      {
        Origin: "http://localhost:8080"
      }
    );
    await service.close();

    // Assert
    expect(before.status).to.equal(503);
    expect(after.status).to.equal(200);
    expect(after.body).to.equal('{"schema":"perfkit/live/v1"}');
    expect(after.headers["access-control-allow-origin"]).to.equal(
      "https://fonoster.github.io"
    );
    expect(preflight.status).to.equal(204);
    expect(preflight.headers["access-control-allow-headers"]).to.equal(
      "ngrok-skip-browser-warning"
    );
  });
});
