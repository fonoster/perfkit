/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import { createDoClient, DigitalOceanError } from "../../src/infra/index.js";

const TOKEN = "dop_v1_clienttesttoken";

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("createDoClient", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should call api.digitalocean.com/v2 with the token as a bearer header", async () => {
      // Arrange
      const fetch = sinon
        .stub()
        .resolves(json(202, { droplet: { id: 1, name: "d" } }));
      const client = createDoClient({ token: TOKEN, fetch });

      // Act
      await client.createDroplet({ name: "d" } as never);

      // Assert
      const [url, init] = fetch.firstCall.args as [string, RequestInit];
      expect(url).to.equal("https://api.digitalocean.com/v2/droplets");
      expect(init.method).to.equal("POST");
      expect(init.headers).to.deep.equal({
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      });
      expect(init.body).to.equal(JSON.stringify({ name: "d" }));
      expect(String(init.body)).not.to.include(TOKEN);
    });

    it("should follow every page of a list", async () => {
      // Arrange
      const fetch = sinon.stub();
      fetch.onCall(0).resolves(
        json(200, {
          droplets: [{ id: 1 }],
          links: { pages: { next: "https://api.digitalocean.com/v2/x" } }
        })
      );
      fetch.onCall(1).resolves(json(200, { droplets: [{ id: 2 }], links: {} }));
      const client = createDoClient({ token: TOKEN, fetch });

      // Act
      const droplets = await client.listDroplets({ tag: "perfkit" });

      // Assert
      expect(droplets.map(({ id }) => id)).to.deep.equal([1, 2]);
      expect(fetch.secondCall.args[0]).to.equal(
        "https://api.digitalocean.com/v2/droplets?tag_name=perfkit&per_page=200&page=2"
      );
    });

    it("should resolve a delete of something already gone", async () => {
      // Arrange
      const fetch = sinon
        .stub()
        .resolves(json(404, { id: "not_found", message: "gone" }));
      const client = createDoClient({ token: TOKEN, fetch });

      // Act + Assert
      await client.deleteDroplet(5);
      await client.deleteVpc("v");
      expect(await client.getSshKey("aa:bb")).to.equal(null);
    });

    it("should throw DigitalOcean's message, never the token", async () => {
      // Arrange
      const fetch = sinon.stub().resolves(
        json(422, {
          id: "unprocessable_entity",
          message: "Region is not available"
        })
      );
      const client = createDoClient({ token: TOKEN, fetch });

      // Act
      const err = await client
        .createVpc({ name: "v", region: "nyc9", description: "d" })
        .catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(DigitalOceanError);
      expect((err as DigitalOceanError).message).to.equal(
        "Region is not available"
      );
      expect((err as DigitalOceanError).status).to.equal(422);
      expect(JSON.stringify(err)).not.to.include(TOKEN);
      expect(String((err as Error).stack)).not.to.include(TOKEN);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError for an empty token without echoing it", () => {
      // Arrange
      const fetch = sinon.stub();

      // Act + Assert
      expect(() => createDoClient({ token: "", fetch })).to.throw(
        ValidationError,
        "token: DIGITALOCEAN_TOKEN must not be empty"
      );
      expect(fetch.callCount).to.equal(0);
    });
  });
});
