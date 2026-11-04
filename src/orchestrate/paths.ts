/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** The layout of a run's root, on the droplets or with --local. */
export function runPaths(root: string) {
  return {
    root,
    runJson: `${root}/run.json`,
    status: `${root}/status.json`,
    progress: `${root}/progress.log`,
    done: `${root}/done`,
    failed: `${root}/failed`,
    project: `${root}/project`,
    agent: `${root}/agent`,
    sampler: `${root}/sampler.sh`,
    raw: `${root}/raw`,
    rawOf: (id: string) => `${root}/raw/${id}`
  };
}
