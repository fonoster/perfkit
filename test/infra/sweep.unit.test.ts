/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXAMPLES, ROUTR_CONFIG } from "../fixtures.js";
import { FakeDigitalOcean, infraDeps, perfkit, START } from "./fakes.js";

const TOKEN = "dop_v1_sweeptoken";
const OLD = "20261103T021210Z-41d9a2c";
const FRESH = "20261103T140000Z-aaaaaaa";
const MINUTE = 60 * 1000;

/**
 * An account with an old perfkit run (two tagged droplets, 9h04m old, and
 * its VPC, firewall and key), a fresh perfkit run, an old untagged droplet
 * with a perfkit name, and the shared key.
 */
function seededAccount() {
  const account = new FakeDigitalOcean(() => START);
  const seedRun = (runId: string, ageMs: number) => {
    const name = `perfkit-${runId}`;
    account.vpcs.push({
      id: `vpc-${runId}`,
      name,
      region: "nyc3",
      ip_range: "10.10.0.0/20",
      created_at: new Date(START - ageMs).toISOString()
    });
    account.firewalls.push({
      id: `fw-${runId}`,
      name,
      status: "succeeded",
      created_at: new Date(START - ageMs).toISOString(),
      inbound_rules: [],
      outbound_rules: [],
      droplet_ids: [],
      tags: []
    });
    account.keys.push({
      id: account.keys.length + 1,
      name,
      fingerprint: `fp-${runId}`,
      public_key: "ssh-ed25519 AAAA"
    });
    ["uut", "loadgen"].forEach((role) =>
      account.seedDroplet({
        name: `${name}-${role}`,
        tags: ["perfkit", `perfkit-run-${runId}`],
        createdAt: START - ageMs,
        vpcId: `vpc-${runId}`
      })
    );
  };
  seedRun(OLD, (9 * 60 + 4) * MINUTE);
  seedRun(FRESH, 12 * MINUTE);
  account.seedDroplet({
    name: "perfkit-20261102T010000Z-bbbbbbb-uut",
    tags: [],
    createdAt: START - 30 * 60 * MINUTE
  });
  account.keys.push({
    id: 99,
    name: "perfkit-shared",
    fingerprint: "fp-shared",
    public_key: "ssh-ed25519 BBBB"
  });
  return account;
}

describe("perfkit sweep", () => {
  it("should delete only the old tagged run and keep the fresh run, the untagged droplet and perfkit-shared", async () => {
    // Arrange
    const account = seededAccount();
    const infra = infraDeps({ account, env: { DIGITALOCEAN_TOKEN: TOKEN } });

    // Act
    const result = await perfkit(["sweep", "--older-than", "9h"], infra);

    // Assert
    expect(result).to.deep.equal({
      code: 0,
      out: [
        `deleted droplet perfkit-${OLD}-uut (age 9h04m)`,
        `deleted droplet perfkit-${OLD}-loadgen (age 9h04m)`,
        `deleted firewall, VPC and SSH key of run ${OLD}`,
        ""
      ].join("\n"),
      err: ""
    });
    expect(account.leftovers()).to.deep.equal({
      droplets: [
        `perfkit-${FRESH}-uut`,
        `perfkit-${FRESH}-loadgen`,
        "perfkit-20261102T010000Z-bbbbbbb-uut"
      ],
      vpcs: [`perfkit-${FRESH}`],
      firewalls: [`perfkit-${FRESH}`],
      keys: [`perfkit-${FRESH}`, "perfkit-shared"]
    });
    expect(account.callsTo("deleteTag")).to.deep.equal([
      [`perfkit-run-${OLD}`]
    ]);
  });

  it("should print nothing to sweep and exit 0 when nothing is old enough", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });

    // Act
    const result = await perfkit(["sweep", "--older-than", "10h"], infra);

    // Assert
    expect(result).to.deep.equal({
      code: 0,
      out: "nothing to sweep\n",
      err: ""
    });
    expect(
      infra.account.calls.filter(({ method }) => method.startsWith("delete"))
    ).to.deep.equal([]);
  });

  it("should default --older-than to 9h", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });

    // Act
    const result = await perfkit(["sweep"], infra);

    // Assert
    expect(result.code).to.equal(0);
    expect(result.out).to.include(`of run ${OLD}\n`);
    expect(result.out).not.to.include(FRESH);
  });

  it("should default --older-than to infra.maxLifetime of --config", async () => {
    // Arrange
    const file = join(EXAMPLES, "routr", "perfkit-11h.yaml");
    const text = readFileSync(ROUTR_CONFIG, "utf8").replace(
      "maxLifetime: 9h",
      "maxLifetime: 11h"
    );
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });

    // Act
    const result = await perfkit(["sweep", "--config", file], infra, {
      [file]: text
    });

    // Assert
    expect(result).to.deep.equal({
      code: 0,
      out: "nothing to sweep\n",
      err: ""
    });
  });

  it("should delete a run at any age with --run", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });

    // Act
    const result = await perfkit(["sweep", "--run", FRESH], infra);

    // Assert
    expect(result.code).to.equal(0);
    expect(result.out).to.equal(
      [
        `deleted droplet perfkit-${FRESH}-uut (age 0h12m)`,
        `deleted droplet perfkit-${FRESH}-loadgen (age 0h12m)`,
        `deleted firewall, VPC and SSH key of run ${FRESH}`,
        ""
      ].join("\n")
    );
    expect(infra.account.leftovers().vpcs).to.deep.equal([`perfkit-${OLD}`]);
  });

  it("should delete the leftovers of a run whose droplets are already gone", async () => {
    // Arrange
    const account = seededAccount();
    account.droplets = account.droplets.filter(
      ({ name }) => !name.startsWith(`perfkit-${OLD}`)
    );
    const infra = infraDeps({ account, env: { DIGITALOCEAN_TOKEN: TOKEN } });

    // Act
    const result = await perfkit(["sweep"], infra);

    // Assert
    expect(result.out).to.equal(
      `deleted firewall, VPC and SSH key of run ${OLD}\n`
    );
    expect(account.leftovers().keys).to.deep.equal([
      `perfkit-${FRESH}`,
      "perfkit-shared"
    ]);
  });

  it("should list and delete nothing with --dry-run", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });

    // Act
    const result = await perfkit(["sweep", "--dry-run"], infra);

    // Assert
    expect(result.code).to.equal(0);
    expect(result.out).to.equal(
      [
        `would delete droplet perfkit-${OLD}-uut (age 9h04m)`,
        `would delete droplet perfkit-${OLD}-loadgen (age 9h04m)`,
        `would delete firewall, VPC and SSH key of run ${OLD}`,
        ""
      ].join("\n")
    );
    expect(
      infra.account.calls.filter(({ method }) => method.startsWith("delete"))
    ).to.deep.equal([]);
  });

  it("should exit 3 on a DigitalOcean API error", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });
    infra.account.failures.listDroplets = () => "Unable to authenticate you";

    // Act
    const result = await perfkit(["sweep"], infra);

    // Assert
    expect(result).to.deep.equal({
      code: 3,
      out: "",
      err: "perfkit: DigitalOcean API error: Unable to authenticate you\n"
    });
  });

  it("should exit 3 naming the resource and the run when a delete fails 3 times", async () => {
    // Arrange
    const infra = infraDeps({
      account: seededAccount(),
      env: { DIGITALOCEAN_TOKEN: TOKEN }
    });
    infra.account.failures.deleteFirewall = () => "Firewall is busy";

    // Act
    const result = await perfkit(["sweep"], infra);

    // Assert
    expect(result.code).to.equal(3);
    expect(result.out).to.include(`deleted VPC and SSH key of run ${OLD}\n`);
    expect(result.err).to.equal(
      `perfkit: could not delete firewall fw-${OLD} (perfkit-${OLD}) after 3 attempts: Firewall is busy. Run: perfkit sweep --run ${OLD}\n`
    );
  });

  it("should exit 2 without DIGITALOCEAN_TOKEN", async () => {
    // Arrange
    const infra = infraDeps({ account: seededAccount() });

    // Act
    const result = await perfkit(["sweep"], infra);

    // Assert
    expect(result).to.deep.equal({
      code: 2,
      out: "",
      err: "perfkit: DIGITALOCEAN_TOKEN is not set\n"
    });
    expect(infra.clients).to.deep.equal([]);
  });

  it("should exit 2 for a bad --older-than or --run", async () => {
    // Arrange
    const infra = infraDeps({ env: { DIGITALOCEAN_TOKEN: TOKEN } });

    // Act
    const older = await perfkit(["sweep", "--older-than", "9 hours"], infra);
    const run = await perfkit(["sweep", "--run", "yesterday"], infra);

    // Assert
    expect(older.code).to.equal(2);
    expect(older.err).to.match(/^perfkit: --older-than: expected a duration/);
    expect(run.code).to.equal(2);
    expect(run.err).to.match(/^perfkit: --run: expected <startedAt/);
  });

  it("should list every flag with its default in --help", async () => {
    // Act
    const result = await perfkit(["sweep", "--help"], infraDeps());

    // Assert
    const text = result.out.replace(/\s+/g, " ");
    expect(result.code).to.equal(0);
    [
      "--config <perfkit.yaml>",
      "--run <run-id>",
      "--older-than <duration>",
      "default: infra.maxLifetime of --config, else 9h",
      "--dry-run",
      "default: false",
      "perfkit-shared"
    ].forEach((part) => expect(text).to.include(part));
  });
});
