/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { AnalyzeDeps } from "./types.js";

/** The analyzers' file system access, backed by node:fs. */
export function createNodeAnalyzeDeps(): AnalyzeDeps {
  return {
    readFile: (path) => readFile(path, "utf8"),
    readLines: (path) =>
      createInterface({
        input: createReadStream(path, "utf8"),
        crlfDelay: Infinity
      }),
    readdir: (path) => readdir(path)
  };
}
