/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parse } from "yaml";
import { shellJoin, shellQuote } from "./shellQuote.js";

export interface ComposeTarget {
  /** The project directory on the UUT host. */
  projectDir: string;
  /** The compose file, relative to the project directory. */
  file: string;
  /** The compose project name. */
  name: string;
  env: Record<string, string>;
}

/** `docker compose <args>` in the project directory with the PERFKIT_* env. */
export function composeCommand(target: ComposeTarget, args: string[]): string {
  const env = Object.entries(target.env).map(
    ([key, value]) => `${key}=${value}`
  );
  return `cd ${shellQuote(target.projectDir)} && ${shellJoin([
    "env",
    ...env,
    "docker",
    "compose",
    "-p",
    target.name,
    "-f",
    target.file,
    ...args
  ])}`;
}

export interface ComposeService {
  service: string;
  state: string;
  health: string;
}

/**
 * Parses `docker compose ps -a --format json`: one JSON object per line
 * (compose 2.21 and later) or one JSON array (earlier).
 */
export function parseComposePs(stdout: string): ComposeService[] {
  const text = stdout.trim();
  if (text === "") return [];
  const rows: unknown[] = text.startsWith("[")
    ? (JSON.parse(text) as unknown[])
    : text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as unknown);
  return rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      service: String(value.Service ?? value.Name ?? ""),
      state: String(value.State ?? "").toLowerCase(),
      health: String(value.Health ?? "").toLowerCase()
    };
  });
}

/**
 * True when there is a container for every service, each `running`, and
 * `healthy` when it has a healthcheck.
 */
export function isComposeUp(
  services: readonly ComposeService[],
  expected: number
): boolean {
  return (
    services.length >= Math.max(1, expected) &&
    services.every(
      ({ state, health }) =>
        state === "running" && (health === "" || health === "healthy")
    )
  );
}

/** How many services a compose file defines; 0 when it is not YAML. */
export function countComposeServices(text: string): number {
  try {
    const doc = (parse(text) ?? {}) as { services?: unknown };
    return doc.services && typeof doc.services === "object"
      ? Object.keys(doc.services).length
      : 0;
  } catch {
    return 0;
  }
}
