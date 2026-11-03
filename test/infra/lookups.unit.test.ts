/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import {
  createDockerHubRegistry,
  createGetPublicIp,
  LookupError
} from "../../src/infra/index.js";

const DIGEST = `sha256:${"c".repeat(64)}`;

describe("createDockerHubRegistry", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should get an anonymous token and HEAD the tag's manifest for its digest", async () => {
    // Arrange
    const fetch = sinon.stub();
    fetch.onCall(0).resolves(Response.json({ token: "hub-token" }));
    fetch.onCall(1).resolves(
      new Response(null, {
        status: 200,
        headers: { "docker-content-digest": DIGEST }
      })
    );
    const registry = createDockerHubRegistry({ fetch });

    // Act
    const digest = await registry.getDigest("fonoster/routr-one", "2.31.5");

    // Assert
    expect(digest).to.equal(DIGEST);
    expect(fetch.firstCall.args[0]).to.equal(
      "https://auth.docker.io/token?service=registry.docker.io&scope=repository:fonoster/routr-one:pull"
    );
    const [url, init] = fetch.secondCall.args as [string, RequestInit];
    expect(url).to.equal(
      "https://registry-1.docker.io/v2/fonoster/routr-one/manifests/2.31.5"
    );
    expect(init.method).to.equal("HEAD");
    expect((init.headers as Record<string, string>).Authorization).to.equal(
      "Bearer hub-token"
    );
  });

  it("should return null for a tag or repository Docker Hub does not have", async () => {
    // Arrange
    const fetch = sinon.stub();
    fetch.onCall(0).resolves(Response.json({ token: "t" }));
    fetch.onCall(1).resolves(new Response(null, { status: 404 }));
    fetch.onCall(2).resolves(Response.json({ token: "t" }));
    fetch.onCall(3).resolves(new Response(null, { status: 401 }));
    const registry = createDockerHubRegistry({ fetch });

    // Act + Assert
    expect(await registry.getDigest("fonoster/routr-one", "9.9.9")).to.equal(
      null
    );
    expect(await registry.getDigest("nobody/nothing", "1")).to.equal(null);
  });

  it("should use library/ for an official image", async () => {
    // Arrange
    const fetch = sinon.stub();
    fetch.onCall(0).resolves(Response.json({ token: "t" }));
    fetch
      .onCall(1)
      .resolves(
        new Response(null, { headers: { "docker-content-digest": DIGEST } })
      );

    // Act
    await createDockerHubRegistry({ fetch }).getDigest("postgres", "16");

    // Assert
    expect(fetch.secondCall.args[0]).to.equal(
      "https://registry-1.docker.io/v2/library/postgres/manifests/16"
    );
  });

  it("should throw LookupError when Docker Hub can't be reached", async () => {
    // Arrange
    const fetch = sinon.stub().rejects(new TypeError("fetch failed"));

    // Act
    const err = await createDockerHubRegistry({ fetch })
      .getDigest("fonoster/routr-one", "1")
      .catch((e: unknown) => e);

    // Assert
    expect(err).to.be.instanceOf(LookupError);
    expect((err as Error).message).to.equal(
      "could not reach Docker Hub: fetch failed"
    );
  });
});

describe("createGetPublicIp", () => {
  it("should read this machine's IPv4 address from api.ipify.org", async () => {
    // Arrange
    const fetch = sinon.stub().resolves(new Response("203.0.113.7\n"));

    // Act
    const ip = await createGetPublicIp({ fetch })();

    // Assert
    expect(ip).to.equal("203.0.113.7");
    expect(fetch.firstCall.args[0]).to.equal("https://api.ipify.org");
  });

  it("should throw LookupError for an answer that is not an IPv4 address", async () => {
    // Arrange
    const fetch = sinon.stub().resolves(new Response("<html>"));

    // Act
    const err = await createGetPublicIp({ fetch })().catch((e: unknown) => e);

    // Assert
    expect(err).to.be.instanceOf(LookupError);
    expect((err as Error).message).to.equal(
      "could not find this machine's public IP from api.ipify.org: expected an IPv4 address"
    );
  });
});
