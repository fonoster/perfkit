/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { AnalyzeDeps } from "../analyze/index.js";
import type { AgentFs } from "./types.js";

/**
 * Analyzer file access over files that are still being written: each file
 * is cut after its last newline, so a half-written last line is left out.
 */
export function liveAnalyzeDeps(fs: AgentFs): AnalyzeDeps {
  return {
    readdir: (path) => fs.readdir(path),
    readFile: async (path) => {
      const text = await fs.readFile(path);
      return text.slice(0, text.lastIndexOf("\n") + 1);
    }
  };
}
