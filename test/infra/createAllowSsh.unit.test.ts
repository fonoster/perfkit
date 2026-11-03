/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import { buildFirewall, createAllowSsh } from "../../src/infra/index.js";
import { FakeDigitalOcean, RUN_ID } from "./fakes.js";

async function setup() {
  const client = new FakeDigitalOcean();
  await client.createFirewall(
    buildFirewall({
      name: `perfkit-${RUN_ID}`,
      vpcRange: "10.116.0.0/20",
      sshSources: ["203.0.113.7/32"],
      dropletIds: [1, 2]
    })
  );
  client.calls = [];
  return { client, allowSsh: createAllowSsh({ client }) };
}

describe("createAllowSsh", () => {
  describe("with valid input", () => {
    it("should add the new IP to the SSH sources and change nothing else", async () => {
      // Arrange
      const { client, allowSsh } = await setup();
      const before = structuredClone(client.firewalls[0]!);

      // Act
      await allowSsh(RUN_ID, "198.51.100.20");

      // Assert
      const after = client.firewalls[0]!;
      const ssh = (firewall: typeof after) =>
        firewall.inbound_rules.find(({ ports }) => ports === "22")!;
      expect(ssh(after).sources.addresses).to.deep.equal([
        "203.0.113.7/32",
        "198.51.100.20/32"
      ]);
      const strip = (firewall: typeof after) => ({
        ...firewall,
        inbound_rules: firewall.inbound_rules.filter((r) => r.ports !== "22")
      });
      expect(strip(after)).to.deep.equal(strip(before));
      expect({ ...ssh(after), sources: {} }).to.deep.equal({
        ...ssh(before),
        sources: {}
      });
    });

    it("should change nothing for an IP already allowed", async () => {
      // Arrange
      const { client, allowSsh } = await setup();

      // Act
      await allowSsh(RUN_ID, "203.0.113.7");

      // Assert
      expect(client.callsTo("updateFirewall")).to.deep.equal([]);
    });

    it("should fail for a run without a firewall", async () => {
      // Arrange
      const { allowSsh } = await setup();

      // Act
      const err = await allowSsh(
        "20261103T000000Z-0000000",
        "198.51.100.20"
      ).catch((e: unknown) => e);

      // Assert
      expect((err as Error).message).to.equal(
        "no firewall perfkit-20261103T000000Z-0000000 for run 20261103T000000Z-0000000"
      );
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and call nothing", async () => {
      // Arrange
      const { client, allowSsh } = await setup();

      // Act
      const err = await allowSsh("latest", "0.0.0.0/0").catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(
        (err as ValidationError).fieldErrors.map(({ field }) => field)
      ).to.deep.equal(["ip", "runId"]);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
