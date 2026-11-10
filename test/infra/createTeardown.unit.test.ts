/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { createTeardown } from "../../src/infra/index.js";
import { FakeDigitalOcean, fakeClock, RUN_ID } from "./fakes.js";

function seeded() {
  const { now, sleep, clock } = fakeClock();
  const client = new FakeDigitalOcean(now);
  client.vpcs.push({
    id: "vpc-1",
    name: `perfkit-${RUN_ID}`,
    region: "nyc3",
    ip_range: "10.0.0.0/20",
    created_at: "2026-11-03T14:12:10Z"
  });
  const uut = client.seedDroplet({
    name: `perfkit-${RUN_ID}-uut`,
    tags: ["perfkit"],
    createdAt: now(),
    vpcId: "vpc-1"
  });
  client.keys.push(
    { id: 7, name: `perfkit-${RUN_ID}`, fingerprint: "a", public_key: "k" },
    { id: 8, name: "perfkit-shared", fingerprint: "b", public_key: "k" }
  );
  const teardown = createTeardown({ client, sleep, now });
  const resources = (shared: boolean) => ({
    runId: RUN_ID,
    runTag: `perfkit-run-${RUN_ID}`,
    vpc: { id: "vpc-1", name: `perfkit-${RUN_ID}` },
    droplets: [
      {
        id: uut.id,
        name: uut.name,
        role: "uut" as const,
        publicIp: null,
        privateIp: null
      }
    ],
    sshKey: shared
      ? { id: 8, name: "perfkit-shared", fingerprint: "b", shared: true }
      : { id: 7, name: `perfkit-${RUN_ID}`, fingerprint: "a", shared: false }
  });
  return { client, teardown, resources, clock, uut };
}

describe("createTeardown", () => {
  describe("with valid input", () => {
    it("should delete the droplets, the tag, the VPC and the run-only key", async () => {
      // Arrange
      const { client, teardown, resources } = seeded();

      // Act
      const result = await teardown(resources(false));

      // Assert
      expect(result.failures).to.deep.equal([]);
      expect(result.deleted.map(({ kind }) => kind)).to.deep.equal([
        "droplet",
        "tag",
        "VPC",
        "SSH key"
      ]);
      expect(client.leftovers()).to.deep.equal({
        droplets: [],
        vpcs: [],
        firewalls: [],
        keys: ["perfkit-shared"]
      });
    });

    it("should never delete the shared key", async () => {
      // Arrange
      const { client, teardown, resources } = seeded();

      // Act
      await teardown(resources(true));

      // Assert
      expect(client.callsTo("deleteSshKey")).to.deep.equal([]);
      expect(client.leftovers().keys).to.have.length(2);
    });

    it("should skip the VPC when a droplet in it could not be deleted", async () => {
      // Arrange
      const { client, teardown, resources, uut } = seeded();
      client.failures.deleteDroplet = () => "Droplet is locked";

      // Act
      const result = await teardown(resources(false));

      // Assert
      expect(result.failures).to.deep.equal([
        {
          kind: "droplet",
          id: String(uut.id),
          name: uut.name,
          reason: "after 3 attempts: Droplet is locked"
        }
      ]);
      expect(client.callsTo("deleteDroplet")).to.have.length(3);
      expect(client.callsTo("deleteVpc")).to.deep.equal([]);
      expect(client.callsTo("deleteSshKey")).to.deep.equal([[7]]);
    });

    it("should give up on the VPC after 5 minutes of members", async () => {
      // Arrange
      const { client, teardown, resources, clock } = seeded();
      client.lingerPolls = 1000;
      const start = clock.now;

      // Act
      const result = await teardown(resources(false));

      // Assert
      expect(result.failures).to.deep.equal([
        {
          kind: "VPC",
          id: "vpc-1",
          name: `perfkit-${RUN_ID}`,
          reason: "after 5 minutes: it still has 1 member"
        }
      ]);
      expect(clock.now - start).to.equal(5 * 60 * 1000);
    });

    it("should wait out a VPC delete refused for its active subnets", async () => {
      // Arrange
      const { client, teardown, resources } = seeded();
      client.failures.deleteVpc = (n) =>
        n <= 4 ? "Can not delete VPC with active Subnets" : undefined;

      // Act
      const result = await teardown(resources(false));

      // Assert
      expect(result.failures).to.deep.equal([]);
      expect(result.deleted.map(({ kind }) => kind)).to.include("VPC");
      expect(client.callsTo("deleteVpc")).to.have.length(5);
      expect(client.leftovers().vpcs).to.deep.equal([]);
    });

    it("should do nothing for a run that created nothing", async () => {
      // Arrange
      const { client, teardown } = seeded();

      // Act
      const result = await teardown({ runId: RUN_ID, droplets: [] });

      // Assert
      expect(result).to.deep.equal({ deleted: [], failures: [] });
      expect(client.calls).to.deep.equal([]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and delete nothing", async () => {
      // Arrange
      const { client, teardown } = seeded();

      // Act
      const err = await teardown({
        runId: "latest",
        droplets: [{ id: -1 }]
      } as never).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
