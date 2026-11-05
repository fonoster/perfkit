/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { createStartLiveTunnel } from "../../src/live/createStartLiveTunnel.js";

describe("createStartLiveTunnel", () => {
  it("should forward the static domain to the local server with the token", async () => {
    // Arrange
    const calls: unknown[] = [];
    let closed = false;
    const start = createStartLiveTunnel({
      forward: async (config) => {
        calls.push(config);
        return {
          url: () => "https://routr-benchmarks.ngrok-free.dev",
          close: async () => {
            closed = true;
          }
        };
      }
    });

    // Act
    const tunnel = await start({
      token: "tok",
      domain: "routr-benchmarks.ngrok-free.dev",
      port: 8787
    });
    await tunnel.close();

    // Assert
    expect(calls).to.deep.equal([
      {
        addr: "127.0.0.1:8787",
        authtoken: "tok",
        domain: "routr-benchmarks.ngrok-free.dev"
      }
    ]);
    expect(tunnel.url).to.equal("https://routr-benchmarks.ngrok-free.dev");
    expect(closed).to.equal(true);
  });

  it("should ask for no domain without one", async () => {
    const calls: unknown[] = [];
    const start = createStartLiveTunnel({
      forward: async (config) => {
        calls.push(config);
        return { url: () => "https://random.ngrok.app", close: async () => {} };
      }
    });
    await start({ token: "tok", domain: null, port: 1 });
    expect(calls).to.deep.equal([{ addr: "127.0.0.1:1", authtoken: "tok" }]);
  });

  it("should throw ValidationError without a token", async () => {
    const start = createStartLiveTunnel({
      forward: async () => ({ url: () => null, close: async () => {} })
    });
    let error: unknown;
    await start({ token: "", domain: null, port: 1 }).catch((err: unknown) => {
      error = err;
    });
    expect(error).to.be.instanceOf(ValidationError);
  });
});
