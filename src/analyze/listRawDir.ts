/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { AnalyzeDeps } from "./types.js";

/**
 * Lists a raw results directory. Throws an Error that names the directory
 * when it cannot be read.
 */
export async function listRawDir(
  deps: AnalyzeDeps,
  rawDir: string
): Promise<string[]> {
  try {
    return await deps.readdir(rawDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const reason = code === "ENOENT" ? "no such directory" : String(err);
    throw new Error(`${rawDir}: cannot read the raw results: ${reason}`);
  }
}
