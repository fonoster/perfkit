/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { OTLP_PORT, SIP_PORTS } from "./constants.js";
import type { DoFirewallInput } from "./types.js";

const ANYWHERE = { addresses: ["0.0.0.0/0", "::/0"] };

/**
 * A run's firewall: SIP (tcp and udp) and OTLP (tcp) from the VPC's range
 * only, SSH (22) from `sshSources` and from the VPC (the agent on the load
 * generator drives the UUT over SSH at its private IP), and every outbound
 * connection. It applies to the run's droplets.
 */
export function buildFirewall(input: {
  name: string;
  vpcRange: string;
  sshSources: string[];
  dropletIds: number[];
}): DoFirewallInput {
  const vpc = { addresses: [input.vpcRange] };
  return {
    name: input.name,
    inbound_rules: [
      { protocol: "udp", ports: SIP_PORTS, sources: vpc },
      { protocol: "tcp", ports: SIP_PORTS, sources: vpc },
      { protocol: "tcp", ports: OTLP_PORT, sources: vpc },
      {
        protocol: "tcp",
        ports: "22",
        sources: { addresses: [...input.sshSources, input.vpcRange] }
      }
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
