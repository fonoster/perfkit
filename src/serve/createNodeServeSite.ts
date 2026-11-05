/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createServeSite } from "./createServeSite.js";

/** `createServeSite` over a directory on this machine. */
export function createNodeServeSite(siteDir: string) {
  const at = (path: string) => join(siteDir, ...path.split("/"));
  return createServeSite({
    readSiteFile: async (path) => {
      const stats = await stat(at(path)).catch(() => null);
      return stats?.isFile() ? readFile(at(path), "utf8") : null;
    },
    isSiteDir: async (path) =>
      (await stat(at(path)).catch(() => null))?.isDirectory() ?? false
  });
}
