/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { createHandleLiveRequest } from "../../src/live/createHandleLiveRequest.js";

const SITE = "https://fonoster.github.io/routr/benchmarks";

const handlerWith = (live: string | null) =>
  createHandleLiveRequest({ readLive: async () => live, siteUrl: SITE });

describe("createHandleLiveRequest", () => {
  it("should answer GET /live.json with the snapshot, never cached, with CORS for the site", async () => {
    // Act
    const response = await handlerWith('{"a":1}')({
      method: "GET",
      url: "/live.json?t=1",
      origin: "https://fonoster.github.io"
    });

    // Assert
    expect(response.status).to.equal(200);
    expect(response.body).to.equal('{"a":1}');
    expect(response.headers).to.deep.include({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "https://fonoster.github.io",
      "Access-Control-Allow-Headers": "ngrok-skip-browser-warning"
    });
  });

  it("should answer the preflight with 204 and the allowed header", async () => {
    const response = await handlerWith(null)({
      method: "OPTIONS",
      url: "/live.json",
      origin: "http://localhost:8080"
    });
    expect(response.status).to.equal(204);
    expect(response.headers).to.deep.include({
      "Access-Control-Allow-Origin": "http://localhost:8080",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "ngrok-skip-browser-warning"
    });
  });

  it("should send no CORS headers to another origin", async () => {
    const response = await handlerWith("{}")({
      method: "GET",
      url: "/live.json",
      origin: "https://evil.example"
    });
    expect(response.status).to.equal(200);
    expect(response.headers).to.not.have.property(
      "Access-Control-Allow-Origin"
    );
  });

  it("should answer 503 before the first snapshot", async () => {
    const response = await handlerWith(null)({
      method: "GET",
      url: "/live.json",
      origin: null
    });
    expect(response.status).to.equal(503);
    expect(response.headers["Cache-Control"]).to.equal("no-store");
  });

  it("should answer 404 for any other path or method", async () => {
    const handle = handlerWith("{}");
    const statuses = await Promise.all([
      handle({ method: "GET", url: "/", origin: null }),
      handle({ method: "GET", url: "/status.json", origin: null }),
      handle({ method: "POST", url: "/live.json", origin: null })
    ]);
    expect(statuses.map((r) => r.status)).to.deep.equal([404, 404, 404]);
  });

  it("should throw ValidationError for a request without a method", async () => {
    let error: unknown;
    await handlerWith("{}")({ url: "/live.json", origin: null }).catch(
      (err: unknown) => {
        error = err;
      }
    );
    expect(error).to.be.instanceOf(ValidationError);
  });
});
