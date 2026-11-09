/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

interface PodsJson {
  items?: Array<{
    metadata?: { name?: string; deletionTimestamp?: string };
    status?: {
      phase?: string;
      conditions?: Array<{ type?: string; status?: string }>;
    };
  }>;
}

/**
 * From `kubectl get pods -o json`: true when there is a pod and every pod
 * is Ready, leaving out the ones that are terminating or have finished (a
 * migration Job's pod). Otherwise the names of the pods not Ready yet.
 */
export function arePodsReady(
  podsJson: string
): { ready: true } | { ready: false; waiting: string[] } {
  let pods: PodsJson;
  try {
    pods = JSON.parse(podsJson) as PodsJson;
  } catch {
    return { ready: false, waiting: [] };
  }
  const live = (pods.items ?? []).filter(
    (pod) =>
      !pod.metadata?.deletionTimestamp &&
      pod.status?.phase !== "Succeeded" &&
      pod.status?.phase !== "Failed"
  );
  const waiting = live
    .filter(
      (pod) =>
        !(pod.status?.conditions ?? []).some(
          (condition) =>
            condition.type === "Ready" && condition.status === "True"
        )
    )
    .map((pod) => pod.metadata?.name ?? "?");
  return live.length > 0 && waiting.length === 0
    ? { ready: true }
    : { ready: false, waiting };
}
