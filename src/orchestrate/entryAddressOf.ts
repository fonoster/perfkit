/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

interface ServiceJson {
  spec?: { ports?: Array<{ port?: number }> };
  status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } };
}

/**
 * Where SIPp reaches the entry Service, from `kubectl get service -o json`:
 * its load balancer's address (DigitalOcean's, or MetalLB's on kind) and
 * the Service port, so the port SIPp sends to is the one the UUT
 * advertises. Null while the Service has no address yet, or no such port.
 */
export function entryAddressOf(
  serviceJson: string,
  port: number
): { ip: string; port: number } | null {
  let service: ServiceJson;
  try {
    service = JSON.parse(serviceJson) as ServiceJson;
  } catch {
    return null;
  }
  if (!service.spec?.ports?.some((item) => item.port === port)) return null;
  const ip = service.status?.loadBalancer?.ingress?.find((item) => item.ip)?.ip;
  return ip ? { ip, port } : null;
}
