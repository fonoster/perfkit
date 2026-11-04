/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { RunResources } from "./types.js";

/**
 * A DigitalOcean API error. `message` is DigitalOcean's own message; it never
 * carries the request's headers, so it never carries the token.
 */
export class DigitalOceanError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly method: string,
    public readonly path: string
  ) {
    super(message);
    this.name = "DigitalOceanError";
  }
}

/** An image tag the registry does not have. Nothing was created. */
export class ImageNotFoundError extends Error {
  constructor(public readonly ref: string) {
    super(`image ${ref} not found on Docker Hub`);
    this.name = "ImageNotFoundError";
  }
}

/** The registry or another lookup service failed. Nothing was created. */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

/**
 * Provisioning stopped part-way. `created` is what exists so far, for
 * teardown; `message` says what failed, like `could not create droplet ...`.
 */
export class ProvisionError extends Error {
  constructor(
    message: string,
    public readonly created: RunResources,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

/** The run's AbortSignal fired, on SIGINT or SIGTERM. */
export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

/** The message of any thrown value, first line only. */
export function messageOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0] ?? message;
}
