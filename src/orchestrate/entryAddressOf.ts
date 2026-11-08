/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

interface ServiceJson {
  spec?: { ports?: Array<{ port?: number; nodePort?: number }> };
  status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } };
}

/**
 * Where SIPp reaches the entry Service, from `kubectl get service -o json`:
 * on DigitalOcean its load balancer's address and the Service port; on
 * kind (`nodeIp` given) the node's address and the port's NodePort. Null
 * while the Service has no address yet, or no such port.
 */
export function entryAddressOf(
  serviceJson: string,
  port: number,
  nodeIp: string | null
): { ip: string; port: number } | null {
  let service: ServiceJson;
  try {
    service = JSON.parse(serviceJson) as ServiceJson;
  } catch {
    return null;
  }
  const entry = service.spec?.ports?.find((item) => item.port === port);
  if (!entry) return null;
  if (nodeIp !== null) {
    return entry.nodePort ? { ip: nodeIp, port: entry.nodePort } : null;
  }
  const ip = service.status?.loadBalancer?.ingress?.find(
    (item) => item.ip
  )?.ip;
  return ip ? { ip, port } : null;
}
