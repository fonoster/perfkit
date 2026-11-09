/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** The layout of a run's root, on the droplets or with --local. */
export function runPaths(root: string) {
  return {
    root,
    runJson: `${root}/run.json`,
    status: `${root}/status.json`,
    live: `${root}/live.json`,
    progress: `${root}/progress.log`,
    done: `${root}/done`,
    failed: `${root}/failed`,
    project: `${root}/project`,
    agent: `${root}/agent`,
    sampler: `${root}/sampler.sh`,
    kubeSampler: `${root}/kube-sampler.sh`,
    /** The cluster's kubeconfig, a credential: mode 600, never in a log. */
    kubeconfig: `${root}/keys/kubeconfig`,
    /** A helm benchmark's chart, copied from outside the project. */
    chartOf: (id: string) => `${root}/charts/${id}`,
    /** A helm benchmark's rendered values file. */
    valuesOf: (id: string) => `${root}/helm/${id}/values.yaml`,
    raw: `${root}/raw`,
    rawOf: (id: string) => `${root}/raw/${id}`
  };
}
