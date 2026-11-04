/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { RUN_LABEL } from "./constants.js";
import { shellJoin } from "./shellQuote.js";

export interface DockerRunSpec {
  /** The container name; omitted with `rm`. */
  name?: string;
  runId: string;
  image: string;
  /** `-d`; otherwise the command waits for the container. */
  detach?: boolean;
  /** `--rm`. */
  rm?: boolean;
  /** `--pid host`. */
  pidHost?: boolean;
  capAdd?: string[];
  /** `--platform`, for an image with one architecture. */
  platform?: string;
  /** `host:container` or `host:container:ro`. */
  volumes?: string[];
  workdir?: string;
  env?: Record<string, string>;
  ulimits?: string[];
  /** The command and its arguments, after the image. */
  command: string[];
}

/**
 * A `docker run` command line. Every container perfkit starts uses the host
 * network and carries the `perfkit.run=<run id>` label, so a cancelled run
 * can remove them all.
 */
export function dockerRunCommand(spec: DockerRunSpec): string {
  return shellJoin([
    "docker",
    "run",
    ...(spec.detach ? ["-d"] : []),
    ...(spec.rm ? ["--rm"] : []),
    ...(spec.name ? ["--name", spec.name] : []),
    "--label",
    `${RUN_LABEL}=${spec.runId}`,
    "--network",
    "host",
    ...(spec.pidHost ? ["--pid", "host"] : []),
    ...(spec.capAdd ?? []).flatMap((cap) => ["--cap-add", cap]),
    ...(spec.platform ? ["--platform", spec.platform] : []),
    ...(spec.ulimits ?? []).flatMap((limit) => ["--ulimit", limit]),
    ...(spec.volumes ?? []).flatMap((volume) => ["-v", volume]),
    ...(spec.workdir ? ["-w", spec.workdir] : []),
    ...Object.entries(spec.env ?? {}).flatMap(([key, value]) => [
      "-e",
      `${key}=${value}`
    ]),
    spec.image,
    ...spec.command
  ]);
}

/** Removes containers by name; never fails. */
export function removeContainersCommand(names: readonly string[]): string {
  return names.length === 0
    ? "true"
    : `${shellJoin(["docker", "rm", "-f", ...names])} >/dev/null 2>&1; true`;
}

/**
 * Stops a SIPp container so it writes its buffered rtt rows: SIGUSR1 (SIPp
 * stops placing calls and quits when they end), a second one after 30 s
 * (quit now), then a forced remove after 10 s more.
 */
export function stopSippCommand(name: string): string {
  const n = shellJoin([name]);
  return [
    `docker kill -s USR1 ${n} >/dev/null 2>&1`,
    `timeout 30 docker wait ${n} >/dev/null 2>&1 || { docker kill -s USR1 ${n} >/dev/null 2>&1; timeout 10 docker wait ${n} >/dev/null 2>&1; }`,
    `docker rm -f ${n} >/dev/null 2>&1`,
    "true"
  ].join("; ");
}
