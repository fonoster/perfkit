/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import { type BenchmarkConfig, targetOf } from "../schemas/index.js";
import {
  CAPACITY_RECV_TIMEOUT_MS,
  callIdOf,
  REGISTER_RATE,
  SIPP_LANES,
  SIPP_MAX_SOCKET_CAP,
  SIPP_PORTS,
  SIPP_SOCKET_MARGIN,
  type SippRole
} from "./constants.js";

/** Where an instance's share of the uac users file is, in a SIPp container. */
export function uacUsersFileOf(instance: number): string {
  return `users-uac-${instance}.csv`;
}

/** Where the project is mounted in a SIPp container. */
export const SIPP_PROJECT_DIR = "/project";

/**
 * The flags perfkit passes every SIPp role. SIPp writes its response times
 * every `-rtt_freq` calls and drops the ones it holds when it exits, so the
 * value stays small: at most 9 calls go unmeasured at the end of a run.
 */
export const SIPP_COMMON_FLAGS = [
  "-t",
  "u1",
  "-buff_size",
  "4194304",
  "-trace_rtt",
  "-rtt_freq",
  "10",
  "-trace_stat",
  "-fd",
  "10",
  "-trace_counts",
  "-trace_err",
  "-trace_error_codes",
  "-nostdin"
];

export interface SippRoleSpec {
  role: SippRole;
  /** Which of the role's SIPp processes: 1, or 1 to `load.instances` for the uac. */
  instance: number;
  /** The scenario, relative to the project directory. */
  scenario: string;
  /** SIPp's arguments, after the binary. */
  args: string[];
}

export interface SippRolesInput {
  benchmark: BenchmarkConfig;
  /** The run id, in every Call-ID (`-cid_str <role>-<run id>-%u-%p@%s`). */
  runId?: string;
  uutIp: string;
  /** The load generator's address: SIPp binds to it (`-i`), so it is [local_ip]. */
  loadgenIp: string;
  /** Rows of the register users file, after its first line. */
  registerUsers: number;
  /** A cluster benchmark's entry; otherwise `<uutIp>:<load.port>`. */
  target?: { ip: string; port: number };
  /** A soak's calls per second, required when its rate is `fromCapacity`. */
  cps?: number;
  /** A role's own address instead of `loadgenIp` (SIPp on the kind network). */
  bindIps?: Partial<Record<SippRole, string>>;
}

/**
 * The SIPp roles of a benchmark, in the order they start, with the
 * Contract's flags. Either kind can have callees: the register scenario,
 * answering INVITEs with the uas scenario through `-oocsf`, on port 5070,
 * or the uas alone on 5070; they start before the uac. Each role has its
 * own Call-ID prefix (`-cid_str <role>-<run id>-%u-%p@%s`) and binds to the load
 * generator's address (`-i`), which scenarios use as [local_ip]. The uac and
 * register roles send to the target; no role gets `-s`. The hold is `-d`.
 *
 * A capacity uac ramps (`-rate_increase`, `-rate_max`, `-no_rate_quit`),
 * gives up on a message after 10 s (`-recv_timeout`) and may hold
 * `max × (hold + 20)` calls open; its callees may hold as many more. A soak
 * holds `cps × (hold + 10)`. Over TCP every role runs `-t tn`, one
 * connection per call, with `-max_socket` sized to its open calls. A
 * cluster benchmark's roles are in the cluster lane: 1000 ports up and a
 * `k8s-` Call-ID prefix.
 */
export function buildSippRoles(input: SippRolesInput): SippRoleSpec[] {
  const { benchmark } = input;
  const { load } = benchmark;
  const lane = SIPP_LANES[targetOf(benchmark)];
  const portOf = (role: SippRole) => SIPP_PORTS[role] + lane.portOffset;
  const target = input.target
    ? `${input.target.ip}:${input.target.port}`
    : `${input.uutIp}:${load.port}`;
  const holdS = durationToSeconds(load.hold);
  const hold = ["-d", String(holdS * 1000)];
  const tcp = load.transport === "tcp";
  const instances = load.instances;
  const scenarioFlags = (role: SippRole, scenario: string, instance = 1) => [
    "-sf",
    `${SIPP_PROJECT_DIR}/${scenario}`,
    "-i",
    input.bindIps?.[role] ?? input.loadgenIp,
    "-p",
    String(portOf(role) + instance - 1),
    "-cid_str",
    callIdOf(role, lane.prefix, input.runId, instance),
    ...(tcp ? ["-t", "tn", ...SIPP_COMMON_FLAGS.slice(2)] : SIPP_COMMON_FLAGS)
  ];
  const users = (file: string | undefined) =>
    file ? ["-inf", `${SIPP_PROJECT_DIR}/${file}`] : [];
  /** The uac's users: the whole file, or an instance's share of it in /raw. */
  const uacUsers = (instance: number) =>
    load.uac.users === undefined
      ? []
      : instances > 1
        ? ["-inf", `/raw/${uacUsersFileOf(instance)}`]
        : users(load.uac.users);
  const n = (value: number) => String(value);
  /** An instance's share of a rate, or of a count of open calls. */
  const share = (value: number) =>
    String(Math.round((value / instances) * 1e4) / 1e4);
  const shareCalls = (calls: number) => Math.ceil(calls / instances);
  const instanceList = Array.from({ length: instances }, (_, i) => i + 1);
  /** `-l <calls>`, and over TCP `-max_socket` for them. */
  const open = (calls: number) => [
    "-l",
    n(calls),
    ...(tcp
      ? [
          "-max_socket",
          n(Math.min(calls + SIPP_SOCKET_MARGIN, SIPP_MAX_SOCKET_CAP))
        ]
      : [])
  ];

  const callees = (rampCalls: number | null): SippRoleSpec[] => {
    const { register, uas } = load;
    if (register) {
      return [
        {
          role: "register",
          instance: 1,
          scenario: register.scenario,
          args: [
            target,
            ...scenarioFlags("register", register.scenario),
            ...(uas ? ["-oocsf", `${SIPP_PROJECT_DIR}/${uas.scenario}`] : []),
            ...users(register.users),
            "-m",
            n(input.registerUsers),
            "-r",
            String(REGISTER_RATE),
            ...open(input.registerUsers + (rampCalls ?? 0)),
            "-key",
            "expires",
            n(register.expires),
            "-key",
            "refresh_ms",
            n((register.expires / 2) * 1000),
            "-key",
            "uas_port",
            String(portOf("register"))
          ]
        }
      ];
    }
    if (uas) {
      return [
        {
          role: "uas",
          instance: 1,
          scenario: uas.scenario,
          args: [
            ...scenarioFlags("uas", uas.scenario),
            ...open(rampCalls ?? soakCalls())
          ]
        }
      ];
    }
    return [];
  };

  const soakCps = (): number => {
    if (benchmark.kind !== "soak") return 0;
    const { rate } = benchmark.load;
    if ("cps" in rate) return rate.cps;
    if (input.cps === undefined) {
      throw new Error(
        `${benchmark.id}: the soak's rate comes from ${rate.fromCapacity}, so its calls per second must be given`
      );
    }
    return input.cps;
  };
  const soakCalls = () => Math.ceil(soakCps() * (holdS + 10));

  if (benchmark.kind === "capacity") {
    const { start, step, every, max } = benchmark.load.rate;
    const rampCalls = Math.ceil(max * (holdS + 20));
    return [
      ...callees(rampCalls),
      ...instanceList.map((instance): SippRoleSpec => ({
        role: "uac",
        instance,
        scenario: load.uac.scenario,
        args: [
          target,
          ...scenarioFlags("uac", load.uac.scenario, instance),
          ...uacUsers(instance),
          "-r",
          share(start),
          "-rp",
          "1000",
          "-rate_increase",
          share(step),
          "-rate_interval",
          n(durationToSeconds(every)),
          "-rate_max",
          share(max),
          "-no_rate_quit",
          "-recv_timeout",
          n(CAPACITY_RECV_TIMEOUT_MS),
          ...open(shareCalls(rampCalls)),
          ...hold
        ]
      }))
    ];
  }

  const cps = soakCps();
  return [
    ...callees(null),
    ...instanceList.map((instance): SippRoleSpec => ({
      role: "uac",
      instance,
      scenario: load.uac.scenario,
      args: [
        target,
        ...scenarioFlags("uac", load.uac.scenario, instance),
        ...uacUsers(instance),
        "-r",
        share(cps),
        "-rp",
        "1000",
        ...open(shareCalls(soakCalls())),
        ...hold
      ]
    }))
  ];
}

/** Rows of a SIPp injection file: its lines after the first, not blank. */
export function countUserRows(text: string): number {
  return text
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "").length;
}

/**
 * Splits a SIPp injection file among `instances` uac processes: each gets the
 * first line (the mode, like SEQUENTIAL) and every `instances`-th row, so a
 * user is used by one instance only. Throws when there are fewer users than
 * instances.
 */
export function splitUsers(text: string, instances: number): string[] {
  const lines = text.split("\n");
  const header = lines[0] ?? "";
  const rows = lines.slice(1).filter((line) => line.trim() !== "");
  if (rows.length < instances) {
    throw new Error(
      `the users file has ${rows.length} users, fewer than the ${instances} SIPp instances`
    );
  }
  return Array.from(
    { length: instances },
    (_, instance) =>
      `${header}\n${rows.filter((_row, index) => index % instances === instance).join("\n")}\n`
  );
}
