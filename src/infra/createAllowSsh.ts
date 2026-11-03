/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { resourceNameOf } from "./constants.js";
import { type AllowSshInput, allowSshInputSchema } from "./infra.schema.js";
import type { DoClient, DoFirewall } from "./types.js";

/**
 * Creates `allowSsh(runId, ip)`: it adds `ip` as a /32 to the SSH (22) rule
 * of the run's firewall, `perfkit-<run id>`, and changes nothing else. A
 * later job on another machine calls it before it connects. An address that
 * is already there changes nothing.
 *
 * @param deps - The DigitalOcean client (injected)
 * @returns The firewall after the change
 */
export function createAllowSsh(deps: { client: DoClient }) {
  const fn = async ({ runId, ip }: AllowSshInput): Promise<DoFirewall> => {
    const name = resourceNameOf(runId);
    const firewall = (await deps.client.listFirewalls()).find(
      (candidate) => candidate.name === name
    );
    if (!firewall) throw new Error(`no firewall ${name} for run ${runId}`);
    const source = `${ip}/32`;
    const ssh = firewall.inbound_rules.find(
      (rule) => rule.protocol === "tcp" && rule.ports === "22"
    );
    if (!ssh) throw new Error(`firewall ${name} has no SSH rule`);
    const current = ssh.sources.addresses ?? [];
    if (current.includes(source)) return firewall;
    return deps.client.updateFirewall(firewall.id, {
      name: firewall.name,
      inbound_rules: firewall.inbound_rules.map((rule) =>
        rule === ssh
          ? {
              ...rule,
              sources: { ...rule.sources, addresses: [...current, source] }
            }
          : rule
      ),
      outbound_rules: firewall.outbound_rules,
      droplet_ids: firewall.droplet_ids,
      tags: firewall.tags
    });
  };

  const validated = withErrorHandlingAndValidation(fn, allowSshInputSchema);
  return (runId: string, ip: string) => validated({ runId, ip });
}
