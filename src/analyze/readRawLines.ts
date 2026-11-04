/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";
import type { AnalyzeDeps } from "./types.js";

/**
 * The lines of one raw results file, streamed when the deps can, so a file
 * larger than V8's string limit can still be read. Rejects, like
 * readRawFile, when the run did not write the file.
 */
export async function readRawLines(
  deps: AnalyzeDeps,
  rawDir: string,
  names: readonly string[],
  file: string
): Promise<AsyncIterable<string> | string[]> {
  if (!names.includes(file)) {
    throw new Error(`${rawDir}: missing ${file}`);
  }
  const path = join(rawDir, file);
  return deps.readLines
    ? deps.readLines(path)
    : (await deps.readFile(path)).split("\n");
}
