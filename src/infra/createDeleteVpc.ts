/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { POLL_INTERVAL_MS, VPC_DELETE_BACKOFF_MS } from "./constants.js";
import { messageOf } from "./errors.js";
import { type DeleteVpcInput, deleteVpcInputSchema } from "./infra.schema.js";
import type { DoClient, Now, Sleep } from "./types.js";

type Step =
  | { kind: "members"; members: unknown[] }
  | { kind: "listError"; err: unknown }
  | { kind: "deleteError"; err: unknown };

/**
 * Creates `deleteVpc({ id, timeoutMs })`: it deletes a VPC once DigitalOcean
 * lets it, within `timeoutMs`. DigitalOcean deletes only an empty VPC, so it
 * polls the VPC's members every 5 seconds until there are none, then deletes
 * it. A refused delete (like "Can not delete VPC with active Subnets", which
 * a DOKS cluster's subnets cause for minutes after the cluster is gone, with
 * no members listed) is tried again after 5, 10, 20, 30 and then every 60
 * seconds, until the timeout. The last try is at the deadline.
 *
 * @param deps - The DigitalOcean client and clock (injected)
 * @returns Null once the VPC is deleted, or why it is not, like `after 10
 *   minutes and 9 attempts: Can not delete VPC with active Subnets`
 */
export function createDeleteVpc(deps: {
  client: DoClient;
  sleep: Sleep;
  now: Now;
}) {
  const fn = async ({
    id,
    timeoutMs
  }: DeleteVpcInput): Promise<string | null> => {
    const deadline = deps.now() + timeoutMs;
    const minutes = timeoutMs / 60_000;

    const step = async (): Promise<Step | null> => {
      const members = await deps.client
        .listVpcMembers(id)
        .catch((err: unknown) => ({ err }));
      if (!Array.isArray(members)) {
        return { kind: "listError", err: members.err };
      }
      if (members.length > 0) return { kind: "members", members };
      return deps.client.deleteVpc(id).then(
        () => null,
        (err: unknown) => ({ kind: "deleteError" as const, err })
      );
    };

    const reasonOf = (last: Step, attempts: number): string => {
      if (last.kind === "deleteError") {
        return `after ${minutes} minutes and ${attempts} attempt${attempts === 1 ? "" : "s"}: ${messageOf(last.err)}`;
      }
      if (last.kind === "listError") {
        return `after ${minutes} minutes: ${messageOf(last.err)}`;
      }
      const n = last.members.length;
      return `after ${minutes} minutes: it still has ${n} member${n === 1 ? "" : "s"}`;
    };

    const run = async (attempts: number): Promise<string | null> => {
      const last = await step();
      if (last === null) return null;
      const tried = attempts + (last.kind === "deleteError" ? 1 : 0);
      const left = deadline - deps.now();
      if (left <= 0) return reasonOf(last, tried);
      const wait =
        last.kind === "deleteError"
          ? (VPC_DELETE_BACKOFF_MS[tried - 1] ?? VPC_DELETE_BACKOFF_MS.at(-1)!)
          : POLL_INTERVAL_MS;
      await deps.sleep(Math.min(wait, left));
      return run(tried);
    };

    return run(0);
  };

  return withErrorHandlingAndValidation(fn, deleteVpcInputSchema) as (
    input: DeleteVpcInput
  ) => Promise<string | null>;
}
