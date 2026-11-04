/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parseJsonLines } from "./parseJsonLines.js";
import { udpLineSchema } from "./rawResults.schema.js";
import type { UdpSample } from "./types.js";

/**
 * Parses udp.jsonl. A sample's drops are RcvbufErrors + SndbufErrors;
 * InErrors is left out because it already counts RcvbufErrors. Samples come
 * back in time order.
 */
export function parseUdpJsonl(text: string, file: string): UdpSample[] {
  return parseJsonLines(text, file, udpLineSchema)
    .map((line) => ({
      tMs: Date.parse(line.t),
      host: line.host,
      drops: line.RcvbufErrors + line.SndbufErrors
    }))
    .sort((a, b) => a.tMs - b.tMs);
}
