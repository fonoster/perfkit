/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** Where a run lives on both droplets. */
export const REMOTE_ROOT = "/opt/perfkit";

/**
 * SIPp's fixed local port per role. The callees are one SIPp process on
 * 5070: the register scenario, with the uas scenario answering out-of-call
 * INVITEs (`-oocsf`) on the same socket, because Routr routes a call to
 * the address of the REGISTER's top Via. A soak with a uas and no register
 * runs the uas alone on 5070.
 */
export const SIPP_PORTS = { uac: 5080, register: 5070, uas: 5070 } as const;
export type SippRole = keyof typeof SIPP_PORTS;

/** The sampler's process name for each SIPp role (#2's sipp-uac and peers). */
export const SIPP_PROCESS = {
  uac: "sipp-uac",
  register: "sipp-register",
  uas: "sipp-uas"
} as const;

/**
 * Each role's Call-ID prefix: every SIPp runs as PID 1 in its container,
 * so `%p` repeats; the run id (lowercase) keeps Call-IDs from repeating
 * across runs. A cluster benchmark's roles carry `k8s-` in front, so the
 * samplers of a server soak and a cluster soak running at the same time
 * tell them apart.
 */
export function callIdOf(role: SippRole, prefix = "", runId?: string): string {
  return `${prefix}${role}-${runId ? `${runId.toLowerCase()}-` : ""}%u-%p@%s`;
}

/**
 * The SIPp lane of a target. Soaks on the server and on the cluster run at
 * the same time on one load generator, so the cluster's SIPp roles listen
 * 1000 ports up (6080, 6070) and carry the `k8s-` Call-ID prefix.
 */
export const SIPP_LANES = {
  server: { portOffset: 0, prefix: "" },
  cluster: { portOffset: 1000, prefix: "k8s-" }
} as const;
export type SippLane = keyof typeof SIPP_LANES;

/** A capacity uac gives up on any expected message after this (`-recv_timeout`). */
export const CAPACITY_RECV_TIMEOUT_MS = 10_000;
/** The open-file limit of a SIPp container over TCP. */
export const SIPP_TCP_NOFILE = 65536;
/** The most sockets a SIPp role opens over TCP, below SIPP_TCP_NOFILE. */
export const SIPP_MAX_SOCKET_CAP = 60000;
/** Sockets beyond the open calls: the listening socket, the trace files. */
export const SIPP_SOCKET_MARGIN = 100;

/** Every container perfkit starts carries this label, set to the run id. */
export const RUN_LABEL = "perfkit.run";

/** The UUT must be running (and healthy) within this. */
export const HEALTH_TIMEOUT_MS = 5 * 60 * 1000;
export const HEALTH_POLL_MS = 5 * 1000;
/** A helm benchmark's entry Service must have an address within this. */
export const ENTRY_TIMEOUT_MS = 10 * 60 * 1000;
/** The release name of every helm benchmark's chart. */
export const HELM_RELEASE = "perfkit";
/** The agent checks the UUT, and collect the load generator, this often. */
export const CHECK_INTERVAL_MS = 30 * 1000;
/** Failed checks in a row before a host counts as gone. */
export const MAX_FAILED_CHECKS = 3;
/** How long after a step ends its stat row and rtt rows are on disk. */
export const STEP_GRACE_MS = 11 * 1000;
/** How long SIPp has to write its start time after its container starts. */
export const SIPP_START_TIMEOUT_MS = 60 * 1000;
/** The sampler's period. */
export const SAMPLE_INTERVAL_S = 10;
/** Registrations per second of the register role. */
export const REGISTER_RATE = 20;
/** How often the agent reads the register role's counters while it waits. */
export const REGISTER_POLL_MS = 2 * 1000;
/**
 * How long the callees have to register beyond `users / REGISTER_RATE`:
 * SIPp writes its counters every 10 s (`-fd 10`) and a lost REGISTER is
 * retransmitted for up to 32 s.
 */
export const REGISTER_GRACE_MS = 60 * 1000;
/** `collect --timeout` default: under GitHub's 6 h job limit. */
export const DEFAULT_COLLECT_TIMEOUT = "5h50m";

export const UUT_UNRESPONSIVE = "the server under test stopped responding";
export const CLUSTER_UNRESPONSIVE = "the Kubernetes cluster stopped responding";
export const LOADGEN_UNRESPONSIVE = "the load generator stopped responding";
export const CANCELLED = "the run was cancelled";
export const NOT_SELECTED = "not selected for this run";

/** `<prefix>-<run id in lowercase>-<what>`: a container or compose project. */
export function nameOf(prefix: string, runId: string, what: string): string {
  return `${prefix}-${runId.toLowerCase()}-${what}`;
}
