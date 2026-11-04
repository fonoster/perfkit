/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
export const DO_API_URL = "https://api.digitalocean.com/v2";
export const PUBLIC_IP_URL = "https://api.ipify.org";

/** The droplet OS image in v1. */
export const DROPLET_IMAGE = "ubuntu-24-04-x64";

/** Every perfkit droplet carries it; sweep looks only at droplets with it. */
export const PERFKIT_TAG = "perfkit";
/** Name of the SSH key that PERFKIT_SSH_KEY registers; never deleted. */
export const SHARED_KEY_NAME = "perfkit-shared";

/** Droplets active and cloud-init finished within this, or exit 3. */
export const READY_TIMEOUT_MS = 10 * 60 * 1000;
/** How long teardown waits for a VPC to have no members. */
export const VPC_EMPTY_TIMEOUT_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 5 * 1000;
/** Attempts per delete, and the waits between them. */
export const DELETE_ATTEMPTS = 3;
export const DELETE_BACKOFF_MS = [2 * 1000, 4 * 1000];

/** `perfkit-<run id>`: the VPC, the firewall and the run-only SSH key. */
export function resourceNameOf(runId: string): string {
  return `perfkit-${runId}`;
}

/** `perfkit-run-<run id>`: the tag both droplets of a run carry. */
export function runTagOf(runId: string): string {
  return `perfkit-run-${runId}`;
}
