/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  DELETE_ATTEMPTS,
  DELETE_BACKOFF_MS,
  POLL_INTERVAL_MS,
  VPC_EMPTY_TIMEOUT_MS
} from "./constants.js";
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
 * order: the firewall, the droplets, the run's tag, the VPC, and the SSH key
 * unless it is the shared one. Each delete is tried 3 times with backoff.
 * DigitalOcean deletes only an empty VPC, so it first polls the VPC's members
 * until there are none, for at most 5 minutes; it skips the VPC when a
 * droplet in it could not be deleted.
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

  const waitEmpty = async (
    vpcId: string,
    deadline: number
  ): Promise<string | null> => {
    const members = await deps.client
      .listVpcMembers(vpcId)
      .catch((err: unknown) => err as Error);
    if (Array.isArray(members) && members.length === 0) return null;
    if (deps.now() >= deadline) {
      return Array.isArray(members)
        ? `after 5 minutes: it still has ${members.length} member${members.length === 1 ? "" : "s"}`
        : `after 5 minutes: ${messageOf(members)}`;
    }
    await deps.sleep(POLL_INTERVAL_MS);
    return waitEmpty(vpcId, deadline);
  };

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

    const droplets = await Promise.all(
      resources.droplets.map(({ id, name }) =>
        attempt({ kind: "droplet", id: String(id), name }, () =>
          deps.client.deleteDroplet(id)
        )
      )
    );
    outcomes.push(...droplets);
    const dropletsGone = droplets.every((outcome) => outcome.ok);

    if (resources.runTag && dropletsGone) {
      const name = resources.runTag;
      outcomes.push(
        await attempt({ kind: "tag", id: name, name }, () =>
          deps.client.deleteTag(name)
        )
      );
    }

    if (resources.vpc && dropletsGone) {
      const { id, name } = resources.vpc;
      const resource: DeletedResource = { kind: "VPC", id, name };
      const notEmpty = await waitEmpty(id, deps.now() + VPC_EMPTY_TIMEOUT_MS);
      outcomes.push(
        notEmpty === null
          ? await attempt(resource, () => deps.client.deleteVpc(id))
          : { ok: false, failure: { ...resource, reason: notEmpty } }
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
