/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { runCli } from "../../src/cli/runCli.js";
import type { CliDeps } from "../../src/cli/types.js";
import { infraDeps } from "../infra/fakes.js";

async function serve(args: string[], serveSite?: CliDeps["serveSite"]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["node", "perfkit", "serve", ...args], {
    version: "9.8.7",
    appBundle: async () => "",
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readFile: async () => "",
    isFile: async () => true,
    infra: infraDeps(),
    writeFile: async () => {},
    fetchText: async () => ({ status: 404, text: "" }),
    ...(serveSite ? { serveSite } : {})
  });
  return { code, out: out.join(""), err: err.join("") };
}

describe("perfkit serve", () => {
  it("should serve the site on the port asked for until it is stopped", async () => {
    // Arrange
    const calls: unknown[] = [];

    // Act
    const result = await serve(
      ["--site", "out/benchmarks", "--port", "8095"],
      async (input) => {
        calls.push(input);
        return { port: input.port, stopped: Promise.resolve() };
      }
    );

    // Assert
    expect(calls).to.deep.equal([
      { site: "out/benchmarks", port: 8095, host: "127.0.0.1" }
    ]);
    expect(result).to.deep.equal({
      code: 0,
      out: "serving out/benchmarks at http://127.0.0.1:8095/ (Ctrl-C stops)\n",
      err: ""
    });
  });

  it("should default to port 8080", async () => {
    let port = 0;
    await serve(["--site", "s"], async (input) => {
      port = input.port;
      return { port: input.port, stopped: Promise.resolve() };
    });
    expect(port).to.equal(8080);
  });

  it("should exit 1 for a bad port and 2 when it can't listen", async () => {
    const bad = await serve(["--site", "s", "--port", "x"], async () => {
      throw new Error("never");
    });
    const taken = await serve(["--site", "s"], async () => {
      throw new Error(
        "listen EADDRINUSE: address already in use 127.0.0.1:8080"
      );
    });
    expect(bad.code).to.equal(1);
    expect(bad.err).to.equal(
      "perfkit: --port: expected a port from 0 to 65535\n"
    );
    expect(taken.code).to.equal(2);
    expect(taken.err).to.equal(
      "perfkit: cannot serve s: listen EADDRINUSE: address already in use 127.0.0.1:8080\n"
    );
  });

  it("should exit 1 without --site", async () => {
    const result = await serve([]);
    expect(result.code).to.equal(1);
  });
});
