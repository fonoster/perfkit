/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { buildCloudInit } from "./buildCloudInit.js";
import { buildFirewall } from "./buildFirewall.js";
import {
  CLUSTER_READY_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  READY_TIMEOUT_MS,
  SHARED_KEY_NAME
} from "./constants.js";
import { parseDuration } from "./parseDuration.js";
import { CancelledError, messageOf, ProvisionError } from "./errors.js";
import { fingerprintOf } from "./fingerprintOf.js";
import { type ProvisionOptions, provisionInputSchema } from "./infra.schema.js";
import type {
  CreatedDroplet,
  DoClient,
  DoDroplet,
  DropletPlan,
  Now,
  Plan,
  ProvisionedCluster,
  ProvisionedRun,
  RunResources,
  Sleep,
  SshIdentity,
  SshTools
} from "./types.js";

export interface ProvisionDeps {
  client: DoClient;
  ssh: SshTools;
  sleep: Sleep;
  now: Now;
  /** From PERFKIT_SSH_KEY: reused as `perfkit-shared`, never deleted. */
  sharedIdentity?: SshIdentity;
}

type ReadyDroplet = CreatedDroplet & { publicIp: string; privateIp: string };

/**
 * Creates `provision(plan, { authorizedKeys })`. It creates, in this order,
 * the SSH key, the VPC, the UUT and load-generator droplets, the DOKS
 * cluster in the same VPC when the plan has one, and the firewall, then
 * waits until both droplets are active and cloud-init has finished
 * (`cloud-init status --wait` over SSH), for at most 10 minutes, and the
 * cluster is running, for at most 20. With a cluster it opens the firewall
 * to the cluster's node droplets and reads its kubeconfig, valid for
 * `maxLifetime`.
 *
 * On any failure, or when `options.signal` aborts, it throws a
 * ProvisionError whose `created` lists what exists, for teardown. It never
 * deletes anything itself; `withRun` does.
 *
 * @param deps - The DigitalOcean client, SSH tools and clock (injected)
 */
export function createProvision(deps: ProvisionDeps) {
  const fn = async ({
    plan,
    options
  }: z.output<typeof provisionInputSchema>): Promise<ProvisionedRun> => {
    const created: RunResources = { runId: plan.runId, droplets: [] };
    const fail = (message: string, cause?: unknown): ProvisionError =>
      new ProvisionError(message, structuredClone(created), cause);
    const checkCancelled = () => {
      if (options.signal?.aborted) {
        throw fail("cancelled", new CancelledError());
      }
    };
    const step = async <T>(what: string, run: () => Promise<T>) => {
      checkCancelled();
      try {
        return await run();
      } catch (err) {
        throw fail(`${what}: ${messageOf(err)}`, err);
      }
    };

    const identity = deps.sharedIdentity
      ? deps.sharedIdentity
      : await step(`could not create SSH key ${plan.resourceName}`, () =>
          deps.ssh.generateKeyPair()
        );

    if (deps.sharedIdentity) {
      const fingerprint = fingerprintOf(identity.publicKey);
      const key = await step(
        `could not register SSH key ${SHARED_KEY_NAME}`,
        async () =>
          (await deps.client.getSshKey(fingerprint)) ??
          deps.client.createSshKey({
            name: SHARED_KEY_NAME,
            public_key: identity.publicKey
          })
      );
      created.sshKey = {
        id: key.id,
        name: key.name,
        fingerprint: key.fingerprint,
        shared: true
      };
    } else {
      const key = await step(
        `could not create SSH key ${plan.resourceName}`,
        () =>
          deps.client.createSshKey({
            name: plan.resourceName,
            public_key: identity.publicKey
          })
      );
      created.sshKey = {
        id: key.id,
        name: key.name,
        fingerprint: key.fingerprint,
        shared: false
      };
    }
    const sshKeyId = created.sshKey.id;

    const vpc = await step(
      `could not create VPC ${plan.resourceName} in ${plan.region}`,
      () =>
        deps.client.createVpc({
          name: plan.resourceName,
          region: plan.region,
          description: `perfkit run ${plan.runId}`
        })
    );
    created.vpc = { id: vpc.id, name: vpc.name };

    const createDroplet = async (
      droplet: DropletPlan,
      authorizedKeys: string[]
    ) => {
      created.runTag = plan.runTag;
      const out = await step(
        `could not create droplet ${droplet.name} in ${plan.region}`,
        () =>
          deps.client.createDroplet({
            name: droplet.name,
            region: plan.region,
            size: droplet.size,
            image: droplet.image,
            ssh_keys: [sshKeyId],
            vpc_uuid: vpc.id,
            tags: plan.tags,
            user_data: buildCloudInit({ authorizedKeys }),
            monitoring: false,
            ipv6: false
          })
      );
      created.droplets.push(toCreated(out, droplet.role));
    };
    await createDroplet(plan.uut, options.authorizedKeys);
    await createDroplet(plan.loadgen, []);
    // The other load generators take commands from the agent over SSH, like the UUT
    await plan.workers.reduce(
      (previous, worker) =>
        previous.then(() => createDroplet(worker, options.authorizedKeys)),
      Promise.resolve()
    );

    const clusterPlan = plan.cluster;
    if (clusterPlan) {
      const cluster = await step(
        `could not create Kubernetes cluster ${clusterPlan.name} in ${plan.region}`,
        () =>
          deps.client.createKubernetesCluster({
            name: clusterPlan.name,
            region: plan.region,
            version: clusterPlan.version,
            vpc_uuid: vpc.id,
            tags: plan.tags,
            node_pools: [
              {
                name: `${clusterPlan.name}-pool`,
                size: clusterPlan.size,
                count: clusterPlan.nodes,
                tags: plan.tags
              }
            ]
          })
      );
      created.cluster = { id: cluster.id, name: cluster.name };
    }

    const firewall = await step(
      `could not create firewall ${plan.resourceName}`,
      () =>
        deps.client.createFirewall(
          buildFirewall({
            name: plan.resourceName,
            vpcRange: vpc.ip_range,
            sshSources: [plan.sshSource],
            dropletIds: created.droplets.map(({ id }) => id)
          })
        )
    );
    created.firewall = { id: firewall.id, name: firewall.name };

    const deadline = deps.now() + READY_TIMEOUT_MS;
    const waitActive = async (index: number): Promise<ReadyDroplet> => {
      const current = created.droplets[index]!;
      checkCancelled();
      if (deps.now() >= deadline) {
        throw fail(`droplet ${current.name} was not ready within 10 minutes`);
      }
      const droplet = await step(`could not read droplet ${current.name}`, () =>
        deps.client.getDroplet(current.id)
      );
      const updated = toCreated(droplet, current.role);
      created.droplets[index] = updated;
      if (
        droplet.status === "active" &&
        updated.publicIp !== null &&
        updated.privateIp !== null
      ) {
        return updated as ReadyDroplet;
      }
      await deps.sleep(POLL_INTERVAL_MS, options.signal);
      return waitActive(index);
    };

    const waitCloudInit = async (droplet: ReadyDroplet): Promise<void> => {
      checkCancelled();
      const left = deadline - deps.now();
      if (left <= 0) {
        throw fail(`droplet ${droplet.name} was not ready within 10 minutes`);
      }
      const out = await deps.ssh.exec({
        host: droplet.publicIp,
        privateKey: identity.privateKey,
        command: "cloud-init status --wait",
        timeoutMs: left,
        signal: options.signal
      });
      checkCancelled();
      // 0 is done, 2 is done with recoverable errors; 255 is SSH not up yet.
      if (out.code === 0 || out.code === 2) return;
      if (out.code !== 255) {
        const reason =
          out.stderr.trim().split("\n").pop() || `exit ${out.code}`;
        throw fail(`cloud-init failed on droplet ${droplet.name}: ${reason}`);
      }
      await deps.sleep(POLL_INTERVAL_MS, options.signal);
      return waitCloudInit(droplet);
    };

    const clusterDeadline = deps.now() + CLUSTER_READY_TIMEOUT_MS;
    const waitCluster = async (): Promise<ProvisionedCluster> => {
      const current = created.cluster!;
      checkCancelled();
      if (deps.now() >= clusterDeadline) {
        throw fail(
          `Kubernetes cluster ${current.name} was not running within 20 minutes`
        );
      }
      const cluster = await step(
        `could not read Kubernetes cluster ${current.name}`,
        () => deps.client.getKubernetesCluster(current.id)
      );
      if (cluster.status.state === "error") {
        throw fail(
          `Kubernetes cluster ${current.name} failed: ${cluster.status.message ?? "state error"}`
        );
      }
      const nodeIds = cluster.node_pools.flatMap((pool) =>
        (pool.nodes ?? []).flatMap((node) =>
          node.droplet_id ? [Number(node.droplet_id)] : []
        )
      );
      const expected = cluster.node_pools.reduce(
        (n, pool) => n + pool.count,
        0
      );
      if (cluster.status.state !== "running" || nodeIds.length < expected) {
        await deps.sleep(POLL_INTERVAL_MS, options.signal);
        return waitCluster();
      }
      await step(`could not update firewall ${plan.resourceName}`, () =>
        deps.client.updateFirewall(
          firewall.id,
          buildFirewall({
            name: plan.resourceName,
            vpcRange: vpc.ip_range,
            sshSources: [plan.sshSource],
            dropletIds: created.droplets.map(({ id }) => id),
            clusterDropletIds: nodeIds
          })
        )
      );
      const kubeconfig = await step(
        `could not read the kubeconfig of ${current.name}`,
        () =>
          deps.client.getKubeconfig(
            current.id,
            parseDuration(plan.maxLifetime) / 1000
          )
      );
      return {
        id: cluster.id,
        name: cluster.name,
        version: cluster.version,
        size: clusterPlan!.size,
        nodes: clusterPlan!.nodes,
        kubeconfig
      };
    };

    const droplets = async () => {
      const uut = await waitActive(0);
      const loadgen = await waitActive(1);
      const workers = await Promise.all(
        plan.workers.map((_, index) => waitActive(2 + index))
      );
      await Promise.all(
        [uut, loadgen, ...workers].map((droplet) => waitCloudInit(droplet))
      );
      return { uut, loadgen, workers };
    };
    const [{ uut, loadgen, workers }, provisionedCluster] = await Promise.all([
      droplets(),
      created.cluster ? waitCluster() : Promise.resolve(undefined)
    ]);
    checkCancelled();

    return {
      ...structuredClone(created),
      sshKey: created.sshKey,
      vpc: { ...created.vpc, ipRange: vpc.ip_range },
      firewall: created.firewall,
      uut,
      loadgen,
      workers,
      identity,
      ...(provisionedCluster ? { provisionedCluster } : {})
    };
  };

  const validated = withErrorHandlingAndValidation(fn, provisionInputSchema);
  return (plan: Plan, options: ProvisionOptions = {}) =>
    validated({ plan, options });
}

function toCreated(droplet: DoDroplet, role: CreatedDroplet["role"]) {
  const ip = (type: "public" | "private") =>
    droplet.networks?.v4?.find((network) => network.type === type)
      ?.ip_address ?? null;
  return {
    id: droplet.id,
    name: droplet.name,
    role,
    publicIp: ip("public"),
    privateIp: ip("private")
  };
}
