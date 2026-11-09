/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { DigitalOceanError } from "./errors.js";
import { PERFKIT_TAG, resourceNameOf, runTagOf } from "./constants.js";
import { sweepInputSchema, type SweepInput } from "./infra.schema.js";
import { parseDuration } from "./parseDuration.js";
import type {
  DeletedResource,
  DeleteFailure,
  DoClient,
  DoDroplet,
  DoKubernetesCluster,
  Now,
  RunResources,
  TeardownResult
} from "./types.js";

const RUN_ID = String.raw`(\d{8}T\d{6}Z-[0-9a-f]{7})`;
const RESOURCE_NAME = new RegExp(`^perfkit-${RUN_ID}$`);
const DROPLET_NAME = new RegExp(
  `^perfkit-${RUN_ID}-(uut|loadgen|worker-\\d+)$`
);
const RUN_TAG = new RegExp(`^perfkit-run-${RUN_ID}$`);
const CLUSTER_NAME = /^perfkit-(\d{8})t(\d{6})z-([0-9a-f]{7})$/;

export interface SweptRun {
  runId: string;
  /** Droplets deleted (or, on a dry run, to delete), with their age. */
  droplets: Array<{ id: number; name: string; ageMs: number }>;
  /** The run's Kubernetes cluster deleted (or to delete), with its age. */
  clusters: Array<{ id: string; name: string; ageMs: number }>;
  /** The run's firewall, VPC and SSH key deleted (or to delete). */
  others: DeletedResource[];
  failures: DeleteFailure[];
}

export interface SweepResult {
  dryRun: boolean;
  runs: SweptRun[];
}

/**
 * Creates `sweep({ olderThan, runId, dryRun })`, the backstop for a run whose
 * teardown never happened. It deletes droplets tagged `perfkit` and named
 * `perfkit-<run id>-uut|loadgen|worker-<n>` that are older than `olderThan`, or every
 * one of run `runId` at any age. Once all of a run's droplets are selected
 * (or it has none left and its run id is older than `olderThan`), it also
 * deletes that run's firewall, VPC and SSH key, all named `perfkit-<run id>`.
 * Kubernetes clusters tagged `perfkit` and named `perfkit-<run id>` (in
 * lowercase) are swept the same way, with their load balancers and
 * volumes, and count as the run's droplets do.
 * Nothing else is touched: not an untagged droplet, not `perfkit-shared`.
 *
 * @param deps - The DigitalOcean client, teardown and clock (injected)
 */
export function createSweep(deps: {
  client: DoClient;
  teardown: (resources: RunResources) => Promise<TeardownResult>;
  now: Now;
}) {
  const fn = async (
    input: z.output<typeof sweepInputSchema>
  ): Promise<SweepResult> => {
    const threshold = parseDuration(input.olderThan);
    const now = deps.now();
    const [droplets, vpcs, firewalls, keys, clusters] = await Promise.all([
      deps.client.listDroplets({ tag: PERFKIT_TAG }),
      deps.client.listVpcs(),
      deps.client.listFirewalls(),
      deps.client.listSshKeys(),
      // A token without the kubernetes scope gets 403, and then can't have
      // created a cluster either: sweep the rest.
      deps.client
        .listKubernetesClusters()
        .catch((err: unknown) =>
          err instanceof DigitalOceanError && err.status === 403
            ? []
            : Promise.reject(err)
        )
    ]);
    const ownClusters = clusters.flatMap((cluster) => {
      const runId = runIdOfCluster(cluster);
      return runId === null ? [] : [{ cluster, runId }];
    });

    const ownDroplets = droplets.flatMap((droplet) => {
      const runId = runIdOfDroplet(droplet);
      return runId === null ? [] : [{ droplet, runId }];
    });
    const runIdOfName = (name: string) => RESOURCE_NAME.exec(name)?.[1] ?? null;
    const runIds = [
      ...new Set([
        ...ownDroplets.map(({ runId }) => runId),
        ...ownClusters.map(({ runId }) => runId),
        ...[...vpcs, ...firewalls, ...keys].flatMap(({ name }) => {
          const runId = runIdOfName(name);
          return runId === null ? [] : [runId];
        })
      ])
    ].sort();

    const plans = runIds.flatMap((runId) => {
      const all = ownDroplets.filter((entry) => entry.runId === runId);
      const ageOf = (droplet: DoDroplet) =>
        now - Date.parse(droplet.created_at);
      const selected = all.filter(({ droplet }) =>
        input.runId ? input.runId === runId : ageOf(droplet) > threshold
      );
      const runClusters = ownClusters.filter((entry) => entry.runId === runId);
      const clusterAge = (cluster: DoKubernetesCluster) =>
        now - Date.parse(cluster.created_at);
      const selectedClusters = runClusters.filter(({ cluster }) =>
        input.runId ? input.runId === runId : clusterAge(cluster) > threshold
      );
      const sweepRest = input.runId
        ? input.runId === runId
        : selected.length === all.length &&
          selectedClusters.length === runClusters.length &&
          (all.length + runClusters.length > 0 ||
            now - startOf(runId) > threshold);
      if (selected.length === 0 && selectedClusters.length === 0 && !sweepRest)
        return [];

      const name = resourceNameOf(runId);
      const vpc = sweepRest ? vpcs.find((v) => v.name === name) : undefined;
      const firewall = sweepRest
        ? firewalls.find((f) => f.name === name)
        : undefined;
      const key = sweepRest ? keys.find((k) => k.name === name) : undefined;
      const resources: RunResources = {
        runId,
        runTag: sweepRest && all.length > 0 ? runTagOf(runId) : undefined,
        droplets: selected.map(({ droplet }) => ({
          id: droplet.id,
          name: droplet.name,
          role: droplet.name.endsWith("-uut")
            ? "uut"
            : /-worker-\d+$/.test(droplet.name)
              ? "worker"
              : "loadgen",
          publicIp: null,
          privateIp: null
        })),
        firewall: firewall && { id: firewall.id, name: firewall.name },
        cluster: selectedClusters[0] && {
          id: selectedClusters[0].cluster.id,
          name: selectedClusters[0].cluster.name
        },
        vpc: vpc && { id: vpc.id, name: vpc.name },
        sshKey: key && {
          id: key.id,
          name: key.name,
          fingerprint: key.fingerprint,
          shared: false
        }
      };
      const others: DeletedResource[] = [
        ...(firewall
          ? [{ kind: "firewall" as const, id: firewall.id, name }]
          : []),
        ...(vpc ? [{ kind: "VPC" as const, id: vpc.id, name }] : []),
        ...(key ? [{ kind: "SSH key" as const, id: String(key.id), name }] : [])
      ];
      if (
        selected.length === 0 &&
        selectedClusters.length === 0 &&
        others.length === 0
      )
        return [];
      return [
        {
          resources,
          others,
          clusters: selectedClusters.map(({ cluster }) => ({
            id: cluster.id,
            name: cluster.name,
            ageMs: clusterAge(cluster)
          })),
          droplets: selected.map(({ droplet }) => ({
            id: droplet.id,
            name: droplet.name,
            ageMs: ageOf(droplet)
          }))
        }
      ];
    });

    if (input.dryRun) {
      return {
        dryRun: true,
        runs: plans.map(({ resources, droplets, clusters, others }) => ({
          runId: resources.runId,
          droplets,
          clusters,
          others,
          failures: []
        }))
      };
    }

    const results = await Promise.all(
      plans.map(({ resources }) => deps.teardown(resources))
    );
    return {
      dryRun: false,
      runs: plans.map(({ resources, droplets, clusters }, index) => {
        const { deleted, failures } = results[index]!;
        const gone = (kind: string, id: string) =>
          deleted.some((d) => d.kind === kind && d.id === id);
        return {
          runId: resources.runId,
          droplets: droplets.filter(({ id }) => gone("droplet", String(id))),
          clusters: clusters.filter(({ id }) => gone("cluster", id)),
          others: deleted.filter(
            ({ kind }) =>
              kind !== "droplet" && kind !== "tag" && kind !== "cluster"
          ),
          failures
        };
      })
    };
  };

  return withErrorHandlingAndValidation(fn, sweepInputSchema) as (
    input: SweepInput
  ) => Promise<SweepResult>;
}

function runIdOfDroplet(droplet: DoDroplet): string | null {
  const fromTag = droplet.tags
    .map((tag) => RUN_TAG.exec(tag)?.[1])
    .find((id) => id !== undefined);
  const fromName = DROPLET_NAME.exec(droplet.name)?.[1];
  // Both must agree when both are there; the name is required.
  if (!fromName) return null;
  return fromTag === undefined || fromTag === fromName ? fromName : null;
}

/**
 * A cluster's run id: from its run tag, or from its name, the run id in
 * lowercase. Null without the `perfkit` tag or a perfkit name.
 */
function runIdOfCluster(cluster: DoKubernetesCluster): string | null {
  if (!cluster.tags.includes(PERFKIT_TAG)) return null;
  const m = CLUSTER_NAME.exec(cluster.name);
  if (!m) return null;
  const fromName = `${m[1]}T${m[2]}Z-${m[3]}`;
  const fromTag = cluster.tags
    .map((tag) => RUN_TAG.exec(tag)?.[1])
    .find((id) => id !== undefined);
  return fromTag === undefined || fromTag === fromName ? fromName : null;
}

/** When a run started, from its id: `20261103T141210Z-...`. */
function startOf(runId: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(runId)!;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
}
