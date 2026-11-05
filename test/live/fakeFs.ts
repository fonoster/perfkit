/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { AgentFs } from "../../src/orchestrate/types.js";

/** An in-memory AgentFs; readdir lists the files right under a directory. */
export function fakeFs(files: Record<string, string> = {}): AgentFs & {
  files: Map<string, string>;
} {
  const map = new Map(Object.entries(files));
  const missing = (path: string) =>
    Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  return {
    files: map,
    readFile: async (path) => {
      const text = map.get(path);
      if (text === undefined) throw missing(path);
      return text;
    },
    writeFile: async (path, text) => {
      map.set(path, text);
    },
    appendFile: async (path, text) => {
      map.set(path, (map.get(path) ?? "") + text);
    },
    readdir: async (dir) =>
      [...map.keys()]
        .filter((path) => path.startsWith(`${dir}/`))
        .map((path) => path.slice(dir.length + 1))
        .filter((name) => !name.includes("/")),
    mkdir: async () => {},
    rename: async (from, to) => {
      const text = map.get(from);
      if (text === undefined) throw missing(from);
      map.set(to, text);
      map.delete(from);
    },
    exists: async (path) => map.has(path)
  };
}
