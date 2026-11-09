/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { EventEmitter } from "node:events";
import sinon from "sinon";
import {
  createDoClient,
  createProvision,
  createSweep,
  createTeardown,
  createWithRun,
  DigitalOceanError,
  type DoKubernetesClusterCreate,
  type Plan,
  type SignalSource
} from "../../src/infra/index.js";
import { formatSweep } from "../../src/cli/formatSweep.js";
import {
  FakeDigitalOcean,
  fakeClock,
  fakeSsh,
  makePlan,
  RUN_ID,
  START
} from "./fakes.js";

const NOTHING_LEFT = { droplets: [], vpcs: [], firewalls: [], keys: [] };
const CLUSTER_NAME = "perfkit-20261103t141210z-bd3254a";

async function clusterPlan(): Promise<Plan> {
  return {
    ...(await makePlan()),
    cluster: { name: CLUSTER_NAME, size: "c-8", nodes: 3, version: "latest" }
  };
}

function setup() {
  const { now, sleep } = fakeClock();
  const client = new FakeDigitalOcean(now);
  const signals = new EventEmitter() as EventEmitter & SignalSource;
  const withRun = createWithRun({
    provision: createProvision({ client, ssh: fakeSsh(), sleep, now }),
    teardown: createTeardown({ client, sleep, now }),
    signals
  });
  return { client, signals, withRun };
}

describe("a run's Kubernetes cluster", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("provision", () => {
    it("should create the DOKS cluster in the run's VPC with its tags, open the firewall to its nodes and read a kubeconfig valid for maxLifetime", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      const outcome = await withRun(await clusterPlan(), async ({ run }) => ({
        cluster: run.provisionedCluster,
        vpc: run.vpc.id
      }));

      // Assert
      expect(outcome.status).to.equal("completed");
      const value = (outcome as { value: { cluster: unknown; vpc: string } })
        .value;
      const [create] = client.callsTo("createKubernetesCluster")[0] as [
        DoKubernetesClusterCreate
      ];
      expect(create).to.deep.equal({
        name: CLUSTER_NAME,
        region: "nyc3",
        version: "latest",
        vpc_uuid: value.vpc,
        tags: ["perfkit", `perfkit-run-${RUN_ID}`],
        node_pools: [
          {
            name: `${CLUSTER_NAME}-pool`,
            size: "c-8",
            count: 3,
            tags: ["perfkit", `perfkit-run-${RUN_ID}`]
          }
        ]
      });
      expect(value.cluster).to.deep.include({
        name: CLUSTER_NAME,
        version: "1.33.1-do.0",
        size: "c-8",
        nodes: 3
      });
      expect((value.cluster as { kubeconfig: string }).kubeconfig).to.include(
        "KUBE-SECRET"
      );
      expect(client.callsTo("getKubeconfig")[0]?.[1]).to.equal(9 * 3600);
      const [, firewall] = client.callsTo("updateFirewall").at(-1) as [
        string,
        { inbound_rules: Array<{ protocol: string; sources: unknown }> }
      ];
      expect(
        firewall.inbound_rules.filter(
          ({ sources }) =>
            JSON.stringify(sources) ===
            JSON.stringify({ droplet_ids: [700000, 700001, 700002] })
        )
      ).to.have.length(2);
    });

    it("should create no cluster when the plan has none", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      await withRun(await makePlan(), async () => "ok");

      // Assert
      expect(client.callsTo("createKubernetesCluster")).to.deep.equal([]);
      expect(client.callsTo("deleteKubernetesCluster")).to.deep.equal([]);
    });
  });

  describe("teardown", () => {
    it("should delete the cluster with its load balancers and volumes when the body returns", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      const outcome = await withRun(await clusterPlan(), async () => "done");

      // Assert
      expect(outcome.status).to.equal("completed");
      expect(outcome.teardown.failures).to.deep.equal([]);
      expect(
        outcome.teardown.deleted.filter(({ kind }) => kind === "cluster")
      ).to.have.length(1);
      expect(client.clusters).to.deep.equal([]);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });

    it("should delete the cluster when the body throws", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      const outcome = await withRun(await clusterPlan(), async () => {
        throw new Error("the agent did not start");
      });

      // Assert
      expect(outcome.status).to.equal("failed");
      expect(client.clusters).to.deep.equal([]);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });

    it("should delete the cluster on SIGINT", async () => {
      // Arrange
      const { client, signals, withRun } = setup();

      // Act
      const outcome = await withRun(await clusterPlan(), () => {
        signals.emit("SIGINT");
        return new Promise(() => {});
      });

      // Assert
      expect(outcome.status).to.equal("cancelled");
      expect(client.clusters).to.deep.equal([]);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });

    it("should delete a cluster that failed to come up, and everything else", async () => {
      // Arrange
      const { client, withRun } = setup();
      client.getKubernetesCluster = async (id: string) => {
        const cluster = client.clusters.find((c) => c.id === id)!;
        return {
          ...cluster,
          status: { state: "error", message: "no capacity" }
        };
      };

      // Act
      const outcome = await withRun(await clusterPlan(), async () => "never");

      // Assert
      expect(outcome.status).to.equal("failed");
      expect(String((outcome as { error: Error }).error.message)).to.include(
        `Kubernetes cluster ${CLUSTER_NAME} failed: no capacity`
      );
      expect(client.clusters).to.deep.equal([]);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });

    it("should report a cluster it could not delete and keep the VPC", async () => {
      // Arrange
      const { client, withRun } = setup();
      client.failures.deleteKubernetesCluster = () => "cluster is busy";

      // Act
      const outcome = await withRun(await clusterPlan(), async () => "done");

      // Assert
      expect(outcome.teardown.failures).to.deep.equal([
        {
          kind: "cluster",
          id: client.clusters[0]!.id,
          name: CLUSTER_NAME,
          reason: "after 3 attempts: cluster is busy"
        }
      ]);
      expect(client.callsTo("deleteVpc")).to.deep.equal([]);
    });
  });

  describe("sweep", () => {
    function seedCluster(
      client: FakeDigitalOcean,
      name: string,
      tags: string[],
      createdAt: number
    ) {
      client.clusters.push({
        id: `k8s-${name}`,
        name,
        region: "nyc3",
        version: "1.33.1-do.0",
        created_at: new Date(createdAt).toISOString(),
        tags,
        status: { state: "running" },
        node_pools: []
      });
    }

    it("should delete a perfkit cluster older than --older-than and leave a young one and a foreign one", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      const old = "perfkit-20261101t100000z-aaaaaaa";
      const young = "perfkit-20261103t140000z-bbbbbbb";
      seedCluster(
        client,
        old,
        ["perfkit", "perfkit-run-20261101T100000Z-aaaaaaa", "k8s"],
        START - 48 * 3600 * 1000
      );
      seedCluster(client, young, ["perfkit"], START - 3600 * 1000);
      seedCluster(
        client,
        "perfkit-20261101t100000z-ccccccc",
        ["k8s"],
        START - 48 * 3600 * 1000
      );
      const sweep = createSweep({
        client,
        teardown: createTeardown({
          client,
          sleep: async () => {},
          now: () => START
        }),
        now: () => START
      });

      // Act
      const result = await sweep({ olderThan: "9h" });

      // Assert
      expect(result.runs.map(({ runId }) => runId)).to.deep.equal([
        "20261101T100000Z-aaaaaaa"
      ]);
      expect(result.runs[0]!.clusters).to.deep.equal([
        { id: `k8s-${old}`, name: old, ageMs: 48 * 3600 * 1000 }
      ]);
      expect(client.clusters.map(({ name }) => name)).to.deep.equal([
        young,
        "perfkit-20261101t100000z-ccccccc"
      ]);
      expect(formatSweep(result)).to.equal(
        `deleted Kubernetes cluster ${old} with its load balancers and volumes (age 48h00m)\n`
      );
    });

    it("should sweep droplets as before when the token can't list clusters (403), and fail on other errors", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      client.seedDroplet({
        name: `perfkit-${RUN_ID}-uut`,
        tags: ["perfkit", `perfkit-run-${RUN_ID}`],
        createdAt: START
      });
      client.listKubernetesClusters = async () => {
        throw new DigitalOceanError(
          "You are not authorized to perform this operation",
          403,
          "GET",
          "/kubernetes/clusters"
        );
      };
      const sweep = createSweep({
        client,
        teardown: createTeardown({
          client,
          sleep: async () => {},
          now: () => START
        }),
        now: () => START
      });

      // Act
      const result = await sweep({ runId: RUN_ID });
      client.listKubernetesClusters = async () => {
        throw new DigitalOceanError("server error", 500, "GET", "x");
      };
      const err = await sweep({ runId: RUN_ID }).catch((e: unknown) => e);

      // Assert
      expect(result.runs[0]!.droplets.map(({ name }) => name)).to.deep.equal([
        `perfkit-${RUN_ID}-uut`
      ]);
      expect(result.runs[0]!.clusters).to.deep.equal([]);
      expect(client.droplets).to.deep.equal([]);
      expect(err).to.be.instanceOf(DigitalOceanError);
    });

    it("should delete a run's cluster at any age with --run, and only list it with --dry-run", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      seedCluster(
        client,
        CLUSTER_NAME,
        ["perfkit", `perfkit-run-${RUN_ID}`],
        START
      );
      const sweep = createSweep({
        client,
        teardown: createTeardown({
          client,
          sleep: async () => {},
          now: () => START
        }),
        now: () => START
      });

      // Act
      const dry = await sweep({ runId: RUN_ID, dryRun: true });
      const kept = client.clusters.length;
      const real = await sweep({ runId: RUN_ID });

      // Assert
      expect(dry.runs[0]!.clusters.map(({ name }) => name)).to.deep.equal([
        CLUSTER_NAME
      ]);
      expect(kept).to.equal(1);
      expect(real.runs[0]!.clusters.map(({ name }) => name)).to.deep.equal([
        CLUSTER_NAME
      ]);
      expect(client.clusters).to.deep.equal([]);
    });
  });

  describe("createDoClient", () => {
    it("should delete a cluster with its associated resources and read its kubeconfig as text", async () => {
      // Arrange
      const fetch = sinon.stub();
      fetch.onCall(0).resolves(new Response(null, { status: 204 }));
      fetch
        .onCall(1)
        .resolves(
          new Response("apiVersion: v1\nkind: Config\n", { status: 200 })
        );
      const client = createDoClient({ token: "dop_v1_x", fetch });

      // Act
      await client.deleteKubernetesCluster("abc");
      const kubeconfig = await client.getKubeconfig("abc", 32400);

      // Assert
      expect(fetch.firstCall.args[0]).to.equal(
        "https://api.digitalocean.com/v2/kubernetes/clusters/abc/destroy_with_associated_resources/dangerous"
      );
      expect(fetch.firstCall.args[1].method).to.equal("DELETE");
      expect(fetch.secondCall.args[0]).to.equal(
        "https://api.digitalocean.com/v2/kubernetes/clusters/abc/kubeconfig?expiry_seconds=32400"
      );
      expect(kubeconfig).to.equal("apiVersion: v1\nkind: Config\n");
    });
  });
});
