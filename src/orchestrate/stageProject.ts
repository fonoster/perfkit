/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { cp } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const SKIPPED = new Set([".git", "node_modules", ".perfkit"]);

/**
 * Copies the directory of perfkit.yaml into `dest`, without `.git`,
 * `node_modules`, `.perfkit` or the run's own output directory.
 */
export async function stageProject(
  projectDir: string,
  dest: string,
  outDir: string
): Promise<void> {
  const out = resolve(outDir);
  await cp(projectDir, dest, {
    recursive: true,
    filter: (source) => {
      const path = resolve(source);
      if (path === out) return false;
      const rel = relative(projectDir, path);
      return rel === "" || !SKIPPED.has(basename(path));
    }
  });
}
