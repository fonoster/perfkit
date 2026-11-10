/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { createDeleteVpc } from "../../src/infra/index.js";
import { FakeDigitalOcean, fakeClock, RUN_ID } from "./fakes.js";

const SUBNETS = "Can not delete VPC with active Subnets";
const TEN_MINUTES = 10 * 60 * 1000;

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
  const deleteVpc = createDeleteVpc({ client, sleep, now });
  return { client, clock, deleteVpc };
}

describe("createDeleteVpc", () => {
  describe("with valid input", () => {
    it("should delete the VPC once it has no members", async () => {
      // Arrange
      const { client, clock, deleteVpc } = seeded();
      client.seedDroplet({
        name: `perfkit-${RUN_ID}-uut`,
        tags: ["perfkit"],
        createdAt: clock.now,
        vpcId: "vpc-1"
      });
      client.lingerPolls = 2;
      await client.deleteDroplet(client.droplets[0]!.id);

      // Act
      const reason = await deleteVpc({ id: "vpc-1", timeoutMs: TEN_MINUTES });

      // Assert
      expect(reason).to.equal(null);
      expect(client.callsTo("listVpcMembers")).to.have.length(3);
      expect(client.callsTo("deleteVpc")).to.deep.equal([["vpc-1"]]);
      expect(clock.slept).to.deep.equal([5000, 5000]);
      expect(client.leftovers().vpcs).to.deep.equal([]);
    });

    it("should retry a delete refused for active subnets with backoff", async () => {
      // Arrange
      const { client, clock, deleteVpc } = seeded();
      client.failures.deleteVpc = (n) => (n <= 3 ? SUBNETS : undefined);

      // Act
      const reason = await deleteVpc({ id: "vpc-1", timeoutMs: TEN_MINUTES });

      // Assert
      expect(reason).to.equal(null);
      expect(client.callsTo("deleteVpc")).to.have.length(4);
      expect(clock.slept).to.deep.equal([5000, 10000, 20000]);
      expect(client.leftovers().vpcs).to.deep.equal([]);
    });

    it("should give up on a refused delete at the timeout, trying last at the deadline", async () => {
      // Arrange
      const { client, clock, deleteVpc } = seeded();
      client.failures.deleteVpc = () => SUBNETS;
      const start = clock.now;

      // Act
      const reason = await deleteVpc({ id: "vpc-1", timeoutMs: TEN_MINUTES });

      // Assert
      expect(reason).to.equal(`after 10 minutes and 14 attempts: ${SUBNETS}`);
      expect(client.callsTo("deleteVpc")).to.have.length(14);
      expect(clock.now - start).to.equal(TEN_MINUTES);
      expect(clock.slept.at(-1)).to.equal(55_000);
    });

    it("should give up when the VPC keeps its members", async () => {
      // Arrange
      const { client, clock, deleteVpc } = seeded();
      client.seedDroplet({
        name: `perfkit-${RUN_ID}-uut`,
        tags: ["perfkit"],
        createdAt: clock.now,
        vpcId: "vpc-1"
      });

      // Act
      const reason = await deleteVpc({
        id: "vpc-1",
        timeoutMs: 5 * 60 * 1000
      });

      // Assert
      expect(reason).to.equal("after 5 minutes: it still has 1 member");
      expect(client.callsTo("deleteVpc")).to.deep.equal([]);
    });

    it("should report a members lookup that keeps failing", async () => {
      // Arrange
      const { client, deleteVpc } = seeded();
      client.failures.listVpcMembers = () => "Service Unavailable";

      // Act
      const reason = await deleteVpc({ id: "vpc-1", timeoutMs: 60_000 });

      // Assert
      expect(reason).to.equal("after 1 minutes: Service Unavailable");
      expect(client.callsTo("deleteVpc")).to.deep.equal([]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and call nothing", async () => {
      // Arrange
      const { client, deleteVpc } = seeded();

      // Act
      const err = await deleteVpc({ id: "", timeoutMs: 0 }).catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
