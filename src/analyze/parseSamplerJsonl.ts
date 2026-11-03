/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parseJsonLines } from "./parseJsonLines.js";
import { samplerLineSchema } from "./rawResults.schema.js";
import type { ProcessSample } from "./types.js";

/**
 * Parses sampler.jsonl. Lines with the same time, host and name, several
 * processes matching one name, become one sample: rssKB, cpuTicks and fds
 * are summed and pid is the lowest. Samples come back in time order.
 */
export function parseSamplerJsonl(text: string, file: string): ProcessSample[] {
  const lines = parseJsonLines(text, file, samplerLineSchema);
  const byKey = lines.reduce<Map<string, ProcessSample>>((acc, line) => {
    const key = `${line.t}\u0000${line.host}\u0000${line.name}`;
    const seen = acc.get(key);
    acc.set(
      key,
      seen === undefined
        ? { ...line, tMs: Date.parse(line.t) }
        : {
            ...seen,
            pid: Math.min(seen.pid, line.pid),
            rssKB: seen.rssKB + line.rssKB,
            cpuTicks: seen.cpuTicks + line.cpuTicks,
            fds: seen.fds + line.fds
          }
    );
    return acc;
  }, new Map());
  return [...byKey.values()].sort((a, b) => a.tMs - b.tMs);
}
