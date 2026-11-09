/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { SAMPLE_INTERVAL_S } from "./constants.js";

/**
 * The cluster's sampler, a shell script run in the Kubernetes tools
 * container: `sh kube-sampler.sh <spec file> <out dir> <namespace>`. Every
 * 10 s, for each `name<TAB>label selector` line of the spec, it appends to
 * `<out>/kube-uut.jsonl` one line with the pods of the selector (uid and
 * restart count) and their usage from the Metrics API, as Kubernetes
 * quantities. `toKubeSamplerLines` turns the file into sampler lines.
 */
export const KUBE_SAMPLER_SCRIPT = String.raw`#!/bin/sh
spec="$1"; out="$2"; ns="$3"
mkdir -p "$out"
while :; do
  t=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  while IFS="$(printf '\t')" read -r name selector; do
    [ -n "$name" ] || continue
    pods=$(kubectl get pods -n "$ns" -l "$selector" -o json 2>/dev/null | jq -c '[.items[] | select(.metadata.deletionTimestamp == null) | {pod: .metadata.name, uid: .metadata.uid, restarts: ([.status.containerStatuses[]?.restartCount] | add // 0)}]' 2>/dev/null)
    metrics=$(kubectl get pods.metrics.k8s.io -n "$ns" -l "$selector" -o json 2>/dev/null | jq -c '[.items[] | {pod: .metadata.name, cpu: [.containers[].usage.cpu], memory: [.containers[].usage.memory]}]' 2>/dev/null)
    [ -n "$pods" ] || pods='[]'
    [ -n "$metrics" ] || metrics='[]'
    printf '{"t":"%s","name":"%s","pods":%s,"metrics":%s}\n' "$t" "$name" "$pods" "$metrics" >> "$out/kube-uut.jsonl"
  done < "$spec"
  sleep ${SAMPLE_INTERVAL_S}
done
`;
