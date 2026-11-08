/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { DoFirewallInput } from "./types.js";

const ANYWHERE = { addresses: ["0.0.0.0/0", "::/0"] };

/**
 * A run's firewall: every tcp and udp port and icmp from the VPC's range
 * (the seed script reaches the UUT's API, and the UUT opens new flows to the
 * callees on the load generator), SSH (22) from `sshSources` and from the
 * VPC (the agent on the load generator drives the UUT over SSH at its
 * private IP), and every outbound connection. It applies to the run's
 * droplets. With a cluster, every tcp and udp port is open to its node
 * droplets too: Routr's pods reach the callees on the load generator's
 * public address, from their node's.
 */
export function buildFirewall(input: {
  name: string;
  vpcRange: string;
  sshSources: string[];
  dropletIds: number[];
  clusterDropletIds?: number[];
}): DoFirewallInput {
  const nodes = input.clusterDropletIds ?? [];
  const fromNodes =
    nodes.length === 0
      ? []
      : (["tcp", "udp"] as const).map((protocol) => ({
          protocol,
          ports: "all",
          sources: { droplet_ids: nodes }
        }));
  const vpc = { addresses: [input.vpcRange] };
  return {
    name: input.name,
    inbound_rules: [
      { protocol: "tcp", ports: "all", sources: vpc },
      { protocol: "udp", ports: "all", sources: vpc },
      { protocol: "icmp", sources: vpc },
      {
        protocol: "tcp",
        ports: "22",
        sources: { addresses: [...input.sshSources, input.vpcRange] }
      },
      ...fromNodes
    ],
    outbound_rules: [
      { protocol: "tcp", ports: "all", destinations: ANYWHERE },
      { protocol: "udp", ports: "all", destinations: ANYWHERE },
      { protocol: "icmp", destinations: ANYWHERE }
    ],
    droplet_ids: input.dropletIds,
    tags: []
  };
}
