/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import type { AgentFs } from "./types.js";

/** The agent's file system, backed by node:fs. */
export function createNodeAgentFs(): AgentFs {
  return {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, text) => writeFile(path, text, "utf8"),
    appendFile: (path, text) => appendFile(path, text, "utf8"),
    readdir: (path) => readdir(path),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true });
    },
    rename: (from, to) => rename(from, to),
    exists: (path) =>
      access(path).then(
        () => true,
        () => false
      )
  };
}
