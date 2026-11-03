/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";
import type { AnalyzeDeps } from "./types.js";

/**
 * Reads one file of a raw results directory. Throws an Error naming the
 * file when `names` (the directory listing) does not have it.
 */
export async function readRawFile(
  deps: AnalyzeDeps,
  rawDir: string,
  names: readonly string[],
  file: string
): Promise<string> {
  if (!names.includes(file)) {
    throw new Error(`${rawDir}: missing ${file}`);
  }
  return deps.readFile(join(rawDir, file));
}
