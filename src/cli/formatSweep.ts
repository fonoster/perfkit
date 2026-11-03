/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatAge } from "../infra/formatAge.js";
import type { SweepResult } from "../infra/index.js";

/**
 * The stdout lines of `sweep`: one per droplet, then one per run for its
 * firewall, VPC and SSH key. A dry run says `would delete`. With nothing to
 * delete, `nothing to sweep`.
 */
export function formatSweep(result: SweepResult): string {
  const verb = result.dryRun ? "would delete" : "deleted";
  const lines = result.runs.flatMap((run) => [
    ...run.droplets.map(
      ({ name, ageMs }) => `${verb} droplet ${name} (age ${formatAge(ageMs)})`
    ),
    ...(run.others.length > 0
      ? [
          `${verb} ${list(run.others.map(({ kind }) => kind))} of run ${run.runId}`
        ]
      : [])
  ]);
  return lines.length === 0 ? "nothing to sweep\n" : `${lines.join("\n")}\n`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
