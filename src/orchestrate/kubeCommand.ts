/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { KUBE_TOOLS_IMAGE } from "../tools.js";
import { dockerRunCommand } from "./dockerRunCommand.js";
import { runPaths } from "./paths.js";
import type { RunState } from "./runState.schema.js";

/**
 * A `docker run` of `script` (sh) in the Kubernetes tools container
 * (kubectl, helm, jq, bash) on the cluster's network, with KUBECONFIG set
 * and the run's root mounted at the same path. Detached with `name`;
 * otherwise it waits and removes the container.
 */
export function kubeCommand(
  state: Pick<RunState, "runId" | "root" | "cluster">,
  script: string,
  options: {
    name?: string;
    workdir?: string;
    env?: Record<string, string>;
  } = {}
): string {
  const paths = runPaths(state.root);
  return dockerRunCommand({
    runId: state.runId,
    image: KUBE_TOOLS_IMAGE,
    ...(options.name
      ? { name: options.name, detach: true }
      : { rm: true }),
    network: state.cluster?.network ?? "host",
    volumes: [`${state.root}:${state.root}`],
    ...(options.workdir ? { workdir: options.workdir } : {}),
    env: { ...options.env, KUBECONFIG: paths.kubeconfig },
    command: ["sh", "-c", script]
  });
}
