/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parse } from "yaml";
import { ValidationError } from "../../src/errors/index.js";
import {
  CancelledError,
  createProvision,
  ProvisionError
} from "../../src/infra/index.js";
import {
  FakeDigitalOcean,
  fakeClock,
  fakeSsh,
  makePlan,
  RUN_ID
} from "./fakes.js";

const AGENT_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOrunonlykeyforthisrunonlyXXXXXXXXXXXXXXXX agent";

function setup() {
  const { now, sleep } = fakeClock();
  const client = new FakeDigitalOcean(now);
  const ssh = fakeSsh();
  const provision = createProvision({ client, ssh, sleep, now });
  return { client, ssh, provision };
}

describe("createProvision", () => {
  describe("with valid input", () => {
    it("should return a ready run with both droplets' addresses and the identity", async () => {
      // Arrange
      const { provision, ssh } = setup();
      const plan = await makePlan();

      // Act
      const run = await provision(plan);

      // Assert
      expect(run.runId).to.equal(RUN_ID);
      expect(run.uut.name).to.equal(`perfkit-${RUN_ID}-uut`);
      expect(run.uut.publicIp).to.match(/^203\.0\.113\./);
      expect(run.loadgen.privateIp).to.match(/^10\.116\.0\./);
      expect(run.vpc.ipRange).to.equal("10.116.0.0/20");
      expect(run.sshKey).to.deep.include({
        name: `perfkit-${RUN_ID}`,
        shared: false
      });
      expect(run.identity.privateKey).to.include("OPENSSH PRIVATE KEY");
      expect(ssh.commands).to.deep.equal([
        "cloud-init status --wait",
        "cloud-init status --wait"
      ]);
    });

    it("should create the droplets in the VPC with the tags and a firewall open to SSH from this machine and the VPC only", async () => {
      // Arrange
      const { provision, client } = setup();
      const plan = await makePlan();

      // Act
      await provision(plan);

      // Assert
      const [[uut]] = client.callsTo("createDroplet") as [
        [{ vpc_uuid: string; tags: string[]; image: string; size: string }]
      ];
      expect(uut).to.deep.include({
        vpc_uuid: client.vpcs[0]!.id,
        tags: ["perfkit", `perfkit-run-${RUN_ID}`],
        image: "ubuntu-22-04-x64",
        size: "c-8"
      });
      const [vpc] = client.callsTo("createVpc")[0] as [{ name: string }];
      expect(vpc).to.deep.equal({
        name: `perfkit-${RUN_ID}`,
        region: "nyc3",
        description: `perfkit run ${RUN_ID}`
      });
      const firewall = client.firewalls[0]!;
      expect(firewall.droplet_ids).to.have.length(2);
      expect(
        firewall.inbound_rules.find(({ ports }) => ports === "22")?.sources
      ).to.deep.equal({ addresses: ["203.0.113.7/32", "10.116.0.0/20"] });
      expect(
        firewall.inbound_rules
          .filter(({ ports }) => ports !== "22")
          .map(({ sources }) => sources.addresses)
      ).to.deep.equal([
        ["10.116.0.0/20"],
        ["10.116.0.0/20"],
        ["10.116.0.0/20"]
      ]);
    });

    it("should add authorizedKeys to the UUT's cloud-init only", async () => {
      // Arrange
      const { provision, client } = setup();
      const plan = await makePlan();

      // Act
      await provision(plan, { authorizedKeys: [AGENT_KEY] });

      // Assert
      const [uut, loadgen] = client
        .callsTo("createDroplet")
        .map(([input]) => (input as { user_data: string }).user_data);
      expect(uut).to.include(AGENT_KEY);
      expect(loadgen).not.to.include(AGENT_KEY);
      const files = parse(uut!).write_files as Array<{ path: string }>;
      expect(files.map(({ path }) => path)).to.include(
        "/root/.ssh/authorized_keys"
      );
    });

    it("should retry SSH until it is up", async () => {
      // Arrange
      const { now, sleep } = fakeClock();
      const client = new FakeDigitalOcean(now);
      const ssh = fakeSsh([
        { code: 255, stdout: "", stderr: "Connection refused" },
        { code: 255, stdout: "", stderr: "Connection refused" }
      ]);
      const provision = createProvision({ client, ssh, sleep, now });

      // Act
      await provision(await makePlan());

      // Assert
      expect(ssh.commands).to.have.length(4);
    });

    it("should report what it created when the firewall fails", async () => {
      // Arrange
      const { provision, client } = setup();
      client.failures.createFirewall = () => "Invalid rule";

      // Act
      const err = await provision(await makePlan()).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ProvisionError);
      const { created, message } = err as ProvisionError;
      expect(message).to.equal(
        `could not create firewall perfkit-${RUN_ID}: Invalid rule`
      );
      expect(created.droplets.map(({ role }) => role)).to.deep.equal([
        "uut",
        "loadgen"
      ]);
      expect(created.vpc?.name).to.equal(`perfkit-${RUN_ID}`);
      expect(created.sshKey?.shared).to.equal(false);
      expect(created.firewall).to.equal(undefined);
    });

    it("should stop at the next step once its signal aborts", async () => {
      // Arrange
      const { provision, client } = setup();
      const controller = new AbortController();
      const original = client.createVpc.bind(client);
      client.createVpc = async (input) => {
        const vpc = await original(input);
        controller.abort();
        return vpc;
      };

      // Act
      const err = await provision(await makePlan(), {
        signal: controller.signal
      }).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ProvisionError);
      expect((err as ProvisionError).cause).to.be.instanceOf(CancelledError);
      expect((err as ProvisionError).created.vpc).not.to.equal(undefined);
      expect(client.callsTo("createDroplet")).to.deep.equal([]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and create nothing", async () => {
      // Arrange
      const { provision, client } = setup();
      const plan = await makePlan();

      // Act
      const err = await provision(
        { ...plan, sshSource: "0.0.0.0/0" },
        { authorizedKeys: ["not a key\nruncmd: [evil]"] }
      ).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(
        (err as ValidationError).fieldErrors.map(({ field }) => field)
      ).to.deep.equal(["options.authorizedKeys[0]", "plan.sshSource"]);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
