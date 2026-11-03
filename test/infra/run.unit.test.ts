/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { fingerprintOf } from "../../src/infra/index.js";
import { ROUTR_CONFIG } from "../fixtures.js";
import {
  fakeRegistry,
  infraDeps,
  perfkit,
  PRIVATE_KEY,
  PUBLIC_KEY,
  RUN_ID
} from "./fakes.js";

const TOKEN =
  "dop_v1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";
const RUN = ["run", "--config", ROUTR_CONFIG, "--target-version", "2.31.5"];
const ALL_GONE = { droplets: [], vpcs: [], firewalls: [], keys: [] };
const DELETED = "Everything this run created was deleted.";

const PLAN = `plan for Routr 2.31.5 (dry run, nothing created)
  region     nyc3, new VPC (range assigned by DigitalOcean)
  uut        c-8   ubuntu-24-04-x64
  loadgen    c-16  ubuntu-24-04-x64
  firewall   SIP (5060-5063 tcp/udp) and OTLP (4318 tcp) from the VPC only; SSH (22) from 203.0.113.7 only
  tags       perfkit, perfkit-run-${RUN_ID}
  images     fonoster/routr-edgeport:2.31.5@sha256:4f1c…e2a0
             fonoster/routr-echo:2.31.5@sha256:41ab…77d0
             fonoster/routr-one:2.31.5@sha256:9b07…1d3c
  benchmarks edgeport-echo (capacity, up to 100 min at 50 to 5,000 messages/s)
             one-soak (soak, 6 h 30 min)
  deleted    at the end, or by sweep after 9h
`;

describe("perfkit run", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("--dry-run", () => {
    it("should print the plan with resolved digests and call no DigitalOcean endpoint", async () => {
      // Arrange
      const infra = infraDeps();

      // Act
      const result = await perfkit([...RUN, "--dry-run"], infra);

      // Assert
      expect(result).to.deep.equal({ code: 0, out: PLAN, err: "" });
      expect(infra.clients).to.deep.equal([]);
      expect(infra.account.calls).to.deep.equal([]);
    });

    it("should list only the benchmarks given with --benchmarks", async () => {
      // Act
      const result = await perfkit(
        [...RUN, "--dry-run", "--benchmarks", "one-soak"],
        infraDeps()
      );

      // Assert
      expect(result.code).to.equal(0);
      expect(result.out).to.include(
        "  benchmarks one-soak (soak, 6 h 30 min)\n"
      );
      expect(result.out).not.to.include("edgeport-echo");
    });

    it("should exit 2 for an unknown benchmark id", async () => {
      // Act
      const result = await perfkit(
        [...RUN, "--dry-run", "--benchmarks", "nope"],
        infraDeps()
      );

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        'perfkit: --benchmarks: unknown benchmark "nope"; perfkit.yaml has edgeport-echo, one-soak\n'
      );
    });
  });

  describe("before anything is created", () => {
    it("should exit 2 with the Contract's message when DIGITALOCEAN_TOKEN is not set", async () => {
      // Arrange
      const infra = infraDeps({ registry: fakeRegistry() });
      const ip = sinon.spy(infra, "getPublicIp");

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err: "perfkit: DIGITALOCEAN_TOKEN is not set; nothing was created\n"
      });
      expect(infra.clients).to.deep.equal([]);
      expect(infra.account.calls).to.deep.equal([]);
      expect(ip.callCount).to.equal(0);
    });

    it("should exit 2 naming the image when a tag is missing on Docker Hub", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        registry: fakeRegistry({
          "fonoster/routr-edgeport:2.31.9": `sha256:${"a".repeat(64)}`,
          "fonoster/routr-one:2.31.9": `sha256:${"b".repeat(64)}`
        })
      });

      // Act
      const result = await perfkit([...RUN.slice(0, -1), "2.31.9"], infra);

      // Assert
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err: "perfkit: image fonoster/routr-echo:2.31.9 not found on Docker Hub; nothing was created\n"
      });
      expect(infra.account.calls).to.deep.equal([]);
    });

    it("should exit 2 with the Contract's message without --commit outside a git checkout", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        gitHead: async () => null
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err: "perfkit: --commit is required outside a git checkout\n"
      });
      expect(infra.account.calls).to.deep.equal([]);
    });

    it("should read the commit from git in the config file's directory", async () => {
      // Arrange
      const infra = infraDeps();
      const gitHead = sinon.spy(infra, "gitHead");

      // Act
      await perfkit([...RUN, "--dry-run"], infra);

      // Assert
      expect(gitHead).to.have.been.calledOnceWith(
        ROUTR_CONFIG.replace(/\/perfkit\.yaml$/, "")
      );
    });

    it("should prefer --commit over git", async () => {
      // Arrange
      const infra = infraDeps({ gitHead: async () => null });

      // Act
      const result = await perfkit(
        [...RUN, "--dry-run", "--commit", "41d9a2c"],
        infra
      );

      // Assert
      expect(result.code).to.equal(0);
      expect(result.out).to.include("perfkit-run-20261103T141210Z-41d9a2c");
    });

    it("should exit 2 for a bad --commit", async () => {
      // Act
      const result = await perfkit(
        [...RUN, "--dry-run", "--commit", "not-a-sha"],
        infraDeps()
      );

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        'perfkit: --commit: expected a git commit sha, 7 to 40 hex digits; got "not-a-sha"\n'
      );
    });

    it("should exit 2 for an invalid config", async () => {
      // Act
      const result = await perfkit(
        ["run", "--config", "perf/perfkit.yaml", "--target-version", "2.31.5"],
        infraDeps(),
        { "perf/perfkit.yaml": "apiVersion: perfkit/v1\n" }
      );

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.include(
        "perfkit: perf/perfkit.yaml: project: required\n"
      );
    });

    it("should exit 2 for missing flags", async () => {
      // Act
      const result = await perfkit(
        ["run", "--config", ROUTR_CONFIG],
        infraDeps()
      );

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.include("--target-version <tag>");
    });

    it("should exit 2 for a PERFKIT_SSH_KEY that is not a private key", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN, PERFKIT_SSH_KEY: "nope" }
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.match(
        /^perfkit: PERFKIT_SSH_KEY is not an ed25519 private key/
      );
      expect(infra.account.calls).to.deep.equal([]);
    });
  });

  describe("teardown", () => {
    it("should delete every droplet, the firewall, the VPC and the SSH key when the body succeeds", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(0);
      expect(result.err).to.equal("");
      expect(result.out).to.match(
        new RegExp(`^plan for Routr 2\\.31\\.5 \\(run ${RUN_ID}\\)\n`)
      );
      expect(infra.account.callsTo("createDroplet")).to.have.length(2);
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
      expect([...infra.account.tags]).to.deep.equal(["perfkit"]);
    });

    it("should create in order (SSH key, VPC, droplets, firewall) and delete in reverse", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });

      // Act
      await perfkit(RUN, infra);

      // Assert
      const writes = infra.account.calls
        .map(({ method }) => method)
        .filter((method) => /^(create|delete)/.test(method));
      expect(writes).to.deep.equal([
        "createSshKey",
        "createVpc",
        "createDroplet",
        "createDroplet",
        "createFirewall",
        "deleteFirewall",
        "deleteDroplet",
        "deleteDroplet",
        "deleteTag",
        "deleteVpc",
        "deleteSshKey"
      ]);
    });

    it("should keep every resource and exit 0 when the body hands the run off", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        executeBenchmarks: async (ctx) => {
          ctx.handOff();
          return { passed: true };
        }
      });

      // Act
      const result = await perfkit([...RUN, "--detach"], infra);

      // Assert
      expect(result.code).to.equal(0);
      expect(
        infra.account.calls.filter(({ method }) => method.startsWith("delete"))
      ).to.deep.equal([]);
      expect(infra.account.leftovers()).to.deep.equal({
        droplets: [`perfkit-${RUN_ID}-uut`, `perfkit-${RUN_ID}-loadgen`],
        vpcs: [`perfkit-${RUN_ID}`],
        firewalls: [`perfkit-${RUN_ID}`],
        keys: [`perfkit-${RUN_ID}`]
      });
    });

    it("should delete the VPC on the 3rd poll when members linger for 2 polls", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });
      infra.account.lingerPolls = 2;

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(0);
      expect(infra.account.callsTo("listVpcMembers")).to.have.length(3);
      expect(infra.account.callsTo("deleteVpc")).to.have.length(1);
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });

    it("should delete the same resources and exit 3 when the body throws", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        executeBenchmarks: async () => {
          throw new Error("could not start the agent: exit 1");
        }
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: could not start the agent: exit 1. ${DELETED}\n`
      );
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });

    it("should delete the first droplet, the VPC and the key when the second droplet create fails", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });
      infra.account.failures.createDroplet = (n) =>
        n === 2 ? "You have reached the droplet limit" : undefined;

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: could not create droplet perfkit-${RUN_ID}-loadgen in nyc3: You have reached the droplet limit. ${DELETED}\n`
      );
      const [uut] = infra.account.callsTo("createDroplet");
      expect(infra.account.callsTo("deleteDroplet")).to.have.length(1);
      expect(uut).to.have.length(1);
      expect(infra.account.callsTo("deleteFirewall")).to.deep.equal([]);
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });

    it("should delete everything and exit 130 on SIGINT then SIGTERM during the body", async () => {
      // Arrange
      let aborted = false;
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        signals: process,
        executeBenchmarks: (ctx) => {
          ctx.signal.addEventListener("abort", () => (aborted = true));
          process.emit("SIGINT");
          process.emit("SIGTERM");
          return new Promise(() => {});
        }
      });
      const before = [
        process.listenerCount("SIGINT"),
        process.listenerCount("SIGTERM")
      ];

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(130);
      expect(result.err).to.equal(`perfkit: cancelled by SIGINT. ${DELETED}\n`);
      expect(aborted).to.equal(true);
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
      expect([
        process.listenerCount("SIGINT"),
        process.listenerCount("SIGTERM")
      ]).to.deep.equal(before);
    });

    it("should exit 3 naming the droplet id and perfkit sweep --run when a delete fails 3 times", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });
      const uutId = () =>
        infra.account.droplets.find(({ name }) => name.endsWith("-uut"))!.id;
      let stuck = 0;
      const original = infra.account.deleteDroplet.bind(infra.account);
      infra.account.deleteDroplet = async (id: number) => {
        if (id === uutId()) {
          stuck += 1;
          infra.account.calls.push({ method: "deleteDroplet", args: [id] });
          throw new Error("Droplet is locked");
        }
        return original(id);
      };

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      const id = uutId();
      expect(result.code).to.equal(3);
      expect(stuck).to.equal(3);
      expect(result.err).to.include(
        `perfkit: could not delete droplet ${id} (perfkit-${RUN_ID}-uut) after 3 attempts: Droplet is locked. Run: perfkit sweep --run ${RUN_ID}\n`
      );
      expect(infra.clock.slept).to.include.members([2000, 4000]);
    });

    it("should exit 3 and tear down when cloud-init fails", async () => {
      // Arrange
      const { fakeSsh } = await import("./fakes.js");
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        ssh: fakeSsh([{ code: 1, stdout: "", stderr: "status: error\n" }])
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: cloud-init failed on droplet perfkit-${RUN_ID}-uut: status: error. ${DELETED}\n`
      );
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });

    it("should exit 3 and tear down when the droplets are not ready within 10 minutes", async () => {
      // Arrange
      const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });
      infra.account.pollsUntilActive = Number.POSITIVE_INFINITY;

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: droplet perfkit-${RUN_ID}-uut was not ready within 10 minutes. ${DELETED}\n`
      );
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });

    it("should exit 1 when a benchmark did not pass, after teardown", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN },
        executeBenchmarks: async () => ({ passed: false })
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(1);
      expect(infra.account.leftovers()).to.deep.equal(ALL_GONE);
    });
  });

  describe("PERFKIT_SSH_KEY", () => {
    it("should reuse the account key with the same fingerprint and never delete it", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN, PERFKIT_SSH_KEY: PRIVATE_KEY }
      });
      infra.account.keys.push({
        id: 42,
        name: "perfkit-shared",
        fingerprint: fingerprintOf(PUBLIC_KEY),
        public_key: PUBLIC_KEY
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(0);
      expect(infra.account.callsTo("createSshKey")).to.deep.equal([]);
      expect(infra.account.callsTo("deleteSshKey")).to.deep.equal([]);
      expect(
        (
          infra.account.callsTo("createDroplet")[0]![0] as {
            ssh_keys: number[];
          }
        ).ssh_keys
      ).to.deep.equal([42]);
      expect(infra.account.leftovers().keys).to.deep.equal(["perfkit-shared"]);
    });

    it("should register it as perfkit-shared when the account lacks it, and keep it", async () => {
      // Arrange
      const infra = infraDeps({
        env: { DIGITALOCEAN_TOKEN: TOKEN, PERFKIT_SSH_KEY: PRIVATE_KEY }
      });

      // Act
      const result = await perfkit(RUN, infra);

      // Assert
      expect(result.code).to.equal(0);
      expect(infra.account.callsTo("createSshKey")).to.deep.equal([
        [{ name: "perfkit-shared", public_key: PUBLIC_KEY }]
      ]);
      expect(infra.account.leftovers()).to.deep.equal({
        ...ALL_GONE,
        keys: ["perfkit-shared"]
      });
    });
  });

  describe("the token", () => {
    it("should never appear in stdout, stderr, cloud-init or any API payload", async () => {
      // Arrange: every exit path that prints something
      const results = await Promise.all(
        [[...RUN, "--dry-run"], RUN, [...RUN.slice(0, -1), "2.31.9"]].map(
          async (args) => {
            const infra = infraDeps({
              env: { DIGITALOCEAN_TOKEN: TOKEN },
              executeBenchmarks: async () => {
                throw new Error("benchmarks are not implemented yet");
              }
            });
            const result = await perfkit(args, infra);
            return { result, infra };
          }
        )
      );

      // Assert
      results.forEach(({ result, infra }) => {
        expect(result.out).not.to.include(TOKEN);
        expect(result.err).not.to.include(TOKEN);
        expect(JSON.stringify(infra.account.calls)).not.to.include(TOKEN);
        infra.account.callsTo("createDroplet").forEach(([input]) => {
          expect((input as { user_data: string }).user_data).not.to.include(
            TOKEN
          );
        });
      });
      expect(results[1]!.infra.clients).to.deep.equal([TOKEN]);
    });
  });

  describe("--help", () => {
    it("should list every flag with its default and say the droplets are billable", async () => {
      // Act
      const result = await perfkit(["run", "--help"], infraDeps());

      // Assert
      expect(result.code).to.equal(0);
      [
        "--config <perfkit.yaml>",
        "--target-version <tag>",
        "--commit <sha>",
        "default: git rev-parse HEAD in the directory of the config file",
        "--benchmarks <id,id>",
        "--out <dir>",
        'default: ".perfkit"',
        "--detach",
        "--dry-run",
        "default: false",
        "billable",
        "deletes them at the end",
        "DIGITALOCEAN_TOKEN",
        "PERFKIT_SSH_KEY",
        "130"
      ].forEach((text) =>
        expect(result.out.replace(/\s+/g, " ")).to.include(text)
      );
    });
  });
});
