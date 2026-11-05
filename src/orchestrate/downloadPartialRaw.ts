/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { benchmarkIdSchema } from "../schemas/primitives.schema.js";
import { runPaths } from "./paths.js";
import type { Remote } from "./types.js";

/**
 * Downloads the raw results of every benchmark on the load generator that
 * collect has not downloaded yet, finished or not, into `<runDir>/raw/<id>`.
 * Collect calls it before it gives up on a failed or cancelled run, so the
 * workflow's raw artifact keeps hours of results that the run's teardown
 * would delete. A partial directory gets no `done` marker, so it never
 * counts as finished. It never throws: a benchmark it cannot download is
 * left out.
 *
 * @returns The ids it downloaded, in the load generator's order
 */
export async function downloadPartialRaw(input: {
  remote: Remote;
  root: string;
  runDir: string;
  downloaded: ReadonlySet<string>;
}): Promise<string[]> {
  const paths = runPaths(input.root);
  const listed = await input.remote
    .exec("loadgen", `ls -1 ${paths.raw} 2>/dev/null; true`, {
      timeoutMs: 60 * 1000
    })
    .catch(() => null);
  if (listed === null || listed.code !== 0) return [];
  const ids = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (id) =>
        benchmarkIdSchema.safeParse(id).success && !input.downloaded.has(id)
    );
  return ids.reduce<Promise<string[]>>(
    (previous, id) =>
      previous.then(async (done) => {
        const target = join(input.runDir, "raw", id);
        try {
          await rm(target, { recursive: true, force: true });
          await mkdir(join(input.runDir, "raw"), { recursive: true });
          await input.remote.download("loadgen", paths.rawOf(id), target);
          return [...done, id];
        } catch {
          return done;
        }
      }),
    Promise.resolve([])
  );
}
