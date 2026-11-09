/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { HELM_RELEASE } from "./constants.js";

interface ServiceJson {
  metadata?: { name?: string };
  spec?: { ports?: Array<{ port?: number }> };
  status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } };
}

/**
 * Where SIPp reaches the entry Service, from `kubectl get services -o json`
 * of the benchmark's namespace: the Service named `service`, or
 * `perfkit-<service>` (a chart that puts the release name in front), and
 * its load balancer's address (DigitalOcean's, or MetalLB's on kind) with
 * the Service port, so SIPp sends to the port the UUT advertises. Null
 * while the Service has no address yet, or no such Service or port.
 */
export function entryAddressOf(
  servicesJson: string,
  service: string,
  port: number
): { ip: string; port: number } | null {
  let items: ServiceJson[];
  try {
    items = (JSON.parse(servicesJson) as { items?: ServiceJson[] }).items ?? [];
  } catch {
    return null;
  }
  const names = [service, `${HELM_RELEASE}-${service}`];
  const found = names
    .map((name) => items.find((item) => item.metadata?.name === name))
    .find((item) => item !== undefined);
  if (!found?.spec?.ports?.some((item) => item.port === port)) return null;
  const ip = found.status?.loadBalancer?.ingress?.find((item) => item.ip)?.ip;
  return ip ? { ip, port } : null;
}
