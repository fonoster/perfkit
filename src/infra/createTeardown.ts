/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  DELETE_ATTEMPTS,
  DELETE_BACKOFF_MS,
  VPC_EMPTY_AFTER_CLUSTER_TIMEOUT_MS,
  VPC_EMPTY_TIMEOUT_MS
} from "./constants.js";
import { createDeleteVpc } from "./createDeleteVpc.js";
import { messageOf } from "./errors.js";
import { runResourcesSchema } from "./infra.schema.js";
import type {
  DeletedResource,
  DeleteFailure,
  DoClient,
  Now,
  RunResources,
  Sleep,
  TeardownResult
} from "./types.js";

type Outcome =
  | { ok: true; resource: DeletedResource }
  | { ok: false; failure: DeleteFailure };

/**
 * Creates `teardown(resources)`: it deletes what a run created, in reverse
 * order: the firewall, the droplets and the Kubernetes cluster (with its
 * load balancers and volumes) at the same time, the run's tag, the VPC, and
 * the SSH key unless it is the shared one. Each delete is tried 3 times with
 * backoff, except the VPC: DigitalOcean deletes only an empty VPC, and
 * refuses one with a DOKS cluster's subnets for minutes after the cluster is
 * gone, so it waits for the VPC to have no members and retries its delete
 * with backoff for at most 5 minutes (10 after a cluster). It skips the VPC
 * when a droplet or the cluster in it could not be deleted.
 *
 * It never throws for a failed delete: the result lists every failure, and
 * the caller exits 3 when there is one.
 *
 * @param deps - The DigitalOcean client and clock (injected)
 */
export function createTeardown(deps: {
  client: DoClient;
  sleep: Sleep;
  now: Now;
}) {
  const attempt = async (
    resource: DeletedResource,
    remove: () => Promise<void>,
    tries = 1
  ): Promise<Outcome> => {
    try {
      await remove();
      return { ok: true, resource };
    } catch (err) {
      if (tries >= DELETE_ATTEMPTS) {
        return {
          ok: false,
          failure: {
            ...resource,
            reason: `after ${tries} attempts: ${messageOf(err)}`
          }
        };
      }
      await deps.sleep(DELETE_BACKOFF_MS[tries - 1] ?? 0);
      return attempt(resource, remove, tries + 1);
    }
  };

  const deleteVpc = createDeleteVpc(deps);

  const fn = async (
    resources: z.output<typeof runResourcesSchema>
  ): Promise<TeardownResult> => {
    const outcomes: Outcome[] = [];

    if (resources.firewall) {
      const { id, name } = resources.firewall;
      outcomes.push(
        await attempt({ kind: "firewall", id, name }, () =>
          deps.client.deleteFirewall(id)
        )
      );
    }

    const cluster = resources.cluster;
    const [clusterOutcome, ...droplets] = await Promise.all([
      cluster
        ? attempt({ kind: "cluster", id: cluster.id, name: cluster.name }, () =>
            deps.client.deleteKubernetesCluster(cluster.id)
          )
        : Promise.resolve(null),
      ...resources.droplets.map(({ id, name }) =>
        attempt({ kind: "droplet", id: String(id), name }, () =>
          deps.client.deleteDroplet(id)
        )
      )
    ]);
    const dropletOutcomes = droplets as Outcome[];
    outcomes.push(...dropletOutcomes);
    if (clusterOutcome) outcomes.push(clusterOutcome);
    const dropletsGone = dropletOutcomes.every((outcome) => outcome.ok);
    const clusterGone = clusterOutcome === null || clusterOutcome.ok;

    if (resources.runTag && dropletsGone) {
      const name = resources.runTag;
      outcomes.push(
        await attempt({ kind: "tag", id: name, name }, () =>
          deps.client.deleteTag(name)
        )
      );
    }

    if (resources.vpc && dropletsGone && clusterGone) {
      const { id, name } = resources.vpc;
      const resource: DeletedResource = { kind: "VPC", id, name };
      const waitMs = cluster
        ? VPC_EMPTY_AFTER_CLUSTER_TIMEOUT_MS
        : VPC_EMPTY_TIMEOUT_MS;
      const reason = await deleteVpc({ id, timeoutMs: waitMs });
      outcomes.push(
        reason === null
          ? { ok: true, resource }
          : { ok: false, failure: { ...resource, reason } }
      );
    }

    if (resources.sshKey && !resources.sshKey.shared) {
      const { id, name } = resources.sshKey;
      outcomes.push(
        await attempt({ kind: "SSH key", id: String(id), name }, () =>
          deps.client.deleteSshKey(id)
        )
      );
    }

    return {
      deleted: outcomes.flatMap((o) => (o.ok ? [o.resource] : [])),
      failures: outcomes.flatMap((o) => (o.ok ? [] : [o.failure]))
    };
  };

  const validated = withErrorHandlingAndValidation(fn, runResourcesSchema);
  return (resources: RunResources) => validated(resources);
}
