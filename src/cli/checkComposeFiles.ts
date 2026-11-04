/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { dirname, join } from "node:path";
import { findServicesWithoutHostNetwork } from "../orchestrate/findServicesWithoutHostNetwork.js";
import type { PerfkitConfig } from "../schemas/index.js";

/**
 * One error line per compose service, of the selected benchmarks, that
 * doesn't use `network_mode: host`, checked before anything is created.
 */
export async function checkComposeFiles(
  config: PerfkitConfig,
  configPath: string,
  selected: readonly string[] | undefined,
  readFile: (path: string) => Promise<string>
): Promise<string[]> {
  const files = [
    ...new Set(
      config.benchmarks
        .filter(({ id }) => !selected || selected.includes(id))
        .map(({ uut }) => uut.compose)
    )
  ];
  const lines = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(join(dirname(configPath), file));
      try {
        return findServicesWithoutHostNetwork(text).map(
          (service) =>
            `${file}: service ${service} must use network_mode: host (Docker's UDP port publishing distorts the results); nothing was created`
        );
      } catch {
        return [`${file}: not a valid compose file; nothing was created`];
      }
    })
  );
  return lines.flat();
}
