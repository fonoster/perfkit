/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";

/**
 * `~/.perfkit/runs/<id>/`: what this machine keeps about a run. `id_ed25519`
 * is the run-only login key (absent with PERFKIT_SSH_KEY); `local.json`
 * marks a --local run and `root/` holds it.
 */
export function homeRunDir(home: string, runId: string) {
  const dir = join(home, ".perfkit", "runs", runId);
  return {
    dir,
    key: join(dir, "id_ed25519"),
    local: join(dir, "local.json"),
    root: join(dir, "root")
  };
}
