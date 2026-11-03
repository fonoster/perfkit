/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readdir, readFile } from "node:fs/promises";
import type { AnalyzeDeps } from "./types.js";

/** The analyzers' file system access, backed by node:fs. */
export function createNodeAnalyzeDeps(): AnalyzeDeps {
  return {
    readFile: (path) => readFile(path, "utf8"),
    readdir: (path) => readdir(path)
  };
}
