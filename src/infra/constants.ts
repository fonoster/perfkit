/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
export const DO_API_URL = "https://api.digitalocean.com/v2";
export const PUBLIC_IP_URL = "https://api.ipify.org";

/**
 * The droplet OS image in v1. Not 24.04: on its kernel (6.8) SIPp 3.7.3 places
 * ~5% fewer calls than its rate, then sends the ones it owes in a burst, which
 * spoils capacity steps. On 22.04 (5.15) it holds the rate.
 */
export const DROPLET_IMAGE = "ubuntu-22-04-x64";

/** Every perfkit droplet carries it; sweep looks only at droplets with it. */
export const PERFKIT_TAG = "perfkit";
/** Name of the SSH key that PERFKIT_SSH_KEY registers; never deleted. */
export const SHARED_KEY_NAME = "perfkit-shared";

/** Droplets active and cloud-init finished within this, or exit 3. */
export const READY_TIMEOUT_MS = 10 * 60 * 1000;
/** How long teardown tries to delete a VPC (it waits for it to empty). */
export const VPC_EMPTY_TIMEOUT_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 5 * 1000;
/** Attempts per delete, and the waits between them. */
export const DELETE_ATTEMPTS = 3;
export const DELETE_BACKOFF_MS = [2 * 1000, 4 * 1000];
/**
 * The waits between VPC deletes. DigitalOcean refuses one with "active
 * Subnets" for minutes after a DOKS cluster's delete returns, even when the
 * VPC lists no members, so teardown keeps trying until its VPC timeout.
 */
export const VPC_DELETE_BACKOFF_MS = [5, 10, 20, 30, 60].map((s) => s * 1000);

/** `perfkit-<run id>`: the VPC, the firewall and the run-only SSH key. */
export function resourceNameOf(runId: string): string {
  return `perfkit-${runId}`;
}

/** `perfkit-<run id in lowercase>`: a run's Kubernetes cluster (DOKS or kind). */
export function clusterNameOf(runId: string): string {
  return `perfkit-${runId.toLowerCase()}`;
}

/** A new DOKS cluster must be running within this, or exit 3. */
export const CLUSTER_READY_TIMEOUT_MS = 20 * 60 * 1000;
/** How long teardown tries to delete a VPC after deleting a cluster. */
export const VPC_EMPTY_AFTER_CLUSTER_TIMEOUT_MS = 10 * 60 * 1000;

/** `perfkit-run-<run id>`: the tag both droplets of a run carry. */
export function runTagOf(runId: string): string {
  return `perfkit-run-${runId}`;
}
