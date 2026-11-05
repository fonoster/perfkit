/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { createServeLive } from "../../src/live/createServeLive.js";

function setup(options: { listenFails?: boolean; tunnelFails?: boolean } = {}) {
  const log: string[] = [];
  const closed: string[] = [];
  const tunnels: unknown[] = [];
  const serveLive = createServeLive({
    handle: async () => ({ status: 200, headers: {}, body: "" }),
    listen: async (_handle, { port }) => {
      if (options.listenFails) throw new Error("EADDRINUSE");
      return {
        port,
        close: async () => {
          closed.push("server");
        }
      };
    },
    startTunnel: async (input) => {
      tunnels.push(input);
      if (options.tunnelFails) throw new Error(`bad token ${input.token}`);
      return {
        url: "https://routr-benchmarks.ngrok-free.dev",
        close: async () => {
          closed.push("tunnel");
        }
      };
    },
    log: async (line) => {
      log.push(line);
    }
  });
  return { serveLive, log, closed, tunnels };
}

const INPUT = {
  siteUrl: "https://fonoster.github.io/routr/benchmarks",
  port: 8787,
  host: "127.0.0.1",
  token: "secret-token",
  domain: "routr-benchmarks.ngrok-free.dev"
};

describe("createServeLive", () => {
  it("should serve live.json, open the tunnel and log its public URL, never the token", async () => {
    // Arrange
    const { serveLive, log, closed, tunnels } = setup();

    // Act
    const service = await serveLive(INPUT);
    await service.close();

    // Assert
    expect(tunnels).to.deep.equal([
      {
        token: "secret-token",
        domain: "routr-benchmarks.ngrok-free.dev",
        port: 8787
      }
    ]);
    expect(log).to.deep.equal([
      "perfkit: live.json at http://127.0.0.1:8787/live.json",
      "perfkit: live.json at https://routr-benchmarks.ngrok-free.dev/live.json"
    ]);
    expect(closed).to.deep.equal(["tunnel", "server"]);
  });

  it("should open no tunnel without a token", async () => {
    const { serveLive, tunnels } = setup();
    await serveLive({ ...INPUT, token: null });
    expect(tunnels).to.deep.equal([]);
  });

  it("should go on without a tunnel when it fails, and keep the token out of the log", async () => {
    const { serveLive, log } = setup({ tunnelFails: true });
    await serveLive(INPUT);
    expect(log[1]).to.equal("perfkit: no live tunnel: bad token ***");
  });

  it("should go on when the port is taken", async () => {
    const { serveLive, log } = setup({ listenFails: true });
    const service = await serveLive(INPUT);
    await service.close();
    expect(log).to.deep.equal([
      "perfkit: live.json not served on 127.0.0.1:8787: EADDRINUSE"
    ]);
  });

  it("should throw ValidationError for a bad port", async () => {
    const { serveLive } = setup();
    let error: unknown;
    await serveLive({ ...INPUT, port: 70000 }).catch((err: unknown) => {
      error = err;
    });
    expect(error).to.be.instanceOf(ValidationError);
  });
});
