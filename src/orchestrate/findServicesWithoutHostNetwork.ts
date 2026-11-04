/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parse } from "yaml";

/**
 * The services of a compose file that don't use `network_mode: host`, in
 * file order. Docker's UDP port publishing distorts results at benchmark
 * rates, so perfkit refuses them. A file with no services has none.
 *
 * @throws when the file is not YAML
 */
export function findServicesWithoutHostNetwork(text: string): string[] {
  const doc = (parse(text) ?? {}) as { services?: unknown };
  const services =
    doc.services && typeof doc.services === "object"
      ? (doc.services as Record<string, unknown>)
      : {};
  return Object.entries(services)
    .filter(([, service]) => {
      const mode =
        service && typeof service === "object"
          ? (service as { network_mode?: unknown }).network_mode
          : undefined;
      return mode !== "host";
    })
    .map(([name]) => name);
}
