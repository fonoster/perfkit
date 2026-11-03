/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { request } from "node:http";

describe("root hooks", () => {
  it("should block network access", async () => {
    // Act
    const error = await new Promise<Error>((resolve) => {
      request("http://example.com/", { method: "GET" })
        .on("error", resolve)
        .end();
    });

    // Assert
    expect(error.message).to.match(/disallowed net connect/i);
  });

  it("should block fetch", async () => {
    // Act + Assert
    try {
      await fetch("https://api.digitalocean.com/v2/droplets");
      expect.fail("expected fetch to be blocked");
    } catch (err) {
      expect(String((err as Error).cause ?? err)).to.match(
        /disallowed net connect/i
      );
    }
  });

  it("should hide DIGITALOCEAN_TOKEN", () => {
    expect(process.env.DIGITALOCEAN_TOKEN).to.equal(undefined);
  });
});
