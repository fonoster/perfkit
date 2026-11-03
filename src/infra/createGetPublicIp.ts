/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { PUBLIC_IP_URL } from "./constants.js";
import { LookupError, messageOf } from "./errors.js";

const TIMEOUT_MS = 15 * 1000;

/**
 * Creates the lookup of this machine's public IPv4 address, from
 * https://api.ipify.org. The firewall lets SSH in from it only.
 *
 * @param deps - The fetch to call ipify with (injected)
 * @returns A function that resolves to an address like `203.0.113.7`
 */
export function createGetPublicIp(deps: {
  fetch: typeof fetch;
}): () => Promise<string> {
  return async () => {
    const fail = (reason: string) =>
      new LookupError(
        `could not find this machine's public IP from api.ipify.org: ${reason}`
      );
    const response = await deps
      .fetch(PUBLIC_IP_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .catch((err: unknown) => {
        throw fail(messageOf(err));
      });
    if (!response.ok) throw fail(`HTTP ${response.status}`);
    const ip = (await response.text()).trim();
    if (!z.ipv4().safeParse(ip).success) {
      throw fail("expected an IPv4 address");
    }
    return ip;
  };
}
