/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

export interface KindAddresses {
  /** MetalLB's IPAddressPool range, like 172.18.254.200-172.18.254.250. */
  pool: string;
  /** The fixed address of each SIPp role on the kind network. */
  sippIps: { uac: string; register: string; uas: string };
}

/**
 * Addresses on the kind Docker network that Docker does not hand out
 * (it assigns from the bottom): in a /16 or larger, the second-to-last
 * /24's .200 to .250 for MetalLB's load balancers and .251 to .253 for
 * SIPp, clear of the last /24 another cluster's MetalLB may use; in a
 * smaller subnet, the same offsets below its broadcast address. Null for a
 * subnet that is not IPv4 or is smaller than a /24.
 */
export function kindAddresses(subnet: string): KindAddresses | null {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(subnet.trim());
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix < 8 || prefix > 24) {
    return null;
  }
  const network =
    octets.reduce((value, octet) => value * 256 + octet, 0) -
    (octets.reduce((value, octet) => value * 256 + octet, 0) %
      2 ** (32 - prefix));
  const broadcast = network + 2 ** (32 - prefix) - 1;
  const top = prefix <= 23 ? broadcast - 256 : broadcast;
  const ip = (value: number) =>
    [24, 16, 8, 0]
      .map((shift) => Math.floor(value / 2 ** shift) % 256)
      .join(".");
  return {
    pool: `${ip(top - 55)}-${ip(top - 5)}`,
    sippIps: { uac: ip(top - 4), register: ip(top - 3), uas: ip(top - 2) }
  };
}
