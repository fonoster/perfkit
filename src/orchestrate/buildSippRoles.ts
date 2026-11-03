/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import type { BenchmarkConfig } from "../schemas/index.js";
import {
  callIdOf,
  REGISTER_RATE,
  SIPP_PORTS,
  type SippRole
} from "./constants.js";

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
  /** The scenario, relative to the project directory. */
  scenario: string;
  /** SIPp's arguments, after the binary. */
  args: string[];
}

export interface SippRolesInput {
  benchmark: BenchmarkConfig;
  uutIp: string;
  /** The load generator's address: SIPp binds to it (`-i`), so it is [local_ip]. */
  loadgenIp: string;
  /** Rows of the register users file, after its first line. */
  registerUsers: number;
}

/**
 * The SIPp roles of a benchmark, in the order they start, with the
 * Contract's flags: a capacity benchmark has only the uac; a soak has its
 * callees (the register scenario, answering INVITEs with the uas scenario
 * through `-oocsf`, on port 5070) before its uac. Each role has its own
 * Call-ID prefix (`-cid_str <role>-%u-%p@%s`) and binds to the load
 * generator's address (`-i`), which scenarios use as [local_ip]. The uac and
 * register roles send to `<UUT IP>:<load.port>`; no role gets `-s`. The hold
 * is `-d`.
 */
export function buildSippRoles(input: SippRolesInput): SippRoleSpec[] {
  const { benchmark } = input;
  const { load } = benchmark;
  const target = `${input.uutIp}:${load.port}`;
  const holdS = durationToSeconds(load.hold);
  const hold = ["-d", String(holdS * 1000)];
  const scenarioFlags = (role: SippRole, scenario: string) => [
    "-sf",
    `${SIPP_PROJECT_DIR}/${scenario}`,
    "-i",
    input.loadgenIp,
    "-p",
    String(SIPP_PORTS[role]),
    "-cid_str",
    callIdOf(role),
    ...SIPP_COMMON_FLAGS
  ];
  const users = (file: string | undefined) =>
    file ? ["-inf", `${SIPP_PROJECT_DIR}/${file}`] : [];
  const n = (value: number) => String(value);

  if (benchmark.kind === "capacity") {
    const { start, step, every, max } = benchmark.load.rate;
    return [
      {
        role: "uac",
        scenario: load.uac.scenario,
        args: [
          target,
          ...scenarioFlags("uac", load.uac.scenario),
          ...users(load.uac.users),
          "-r",
          n(start),
          "-rp",
          "1000",
          "-rate_increase",
          n(step),
          "-rate_interval",
          n(durationToSeconds(every)),
          "-rate_max",
          n(max),
          "-no_rate_quit",
          "-l",
          n(Math.ceil(max * (holdS + 10))),
          ...hold
        ]
      }
    ];
  }

  const { cps } = benchmark.load.rate;
  const limit = n(Math.ceil(cps * (holdS + 10)));
  const { register, uas } = benchmark.load;
  const callees: SippRoleSpec[] = register
    ? [
        {
          role: "register",
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
            "-l",
            n(input.registerUsers),
            "-key",
            "expires",
            n(register.expires),
            "-key",
            "refresh_ms",
            n((register.expires / 2) * 1000),
            "-key",
            "uas_port",
            String(SIPP_PORTS.register)
          ]
        }
      ]
    : uas
      ? [
          {
            role: "uas",
            scenario: uas.scenario,
            args: [...scenarioFlags("uas", uas.scenario), "-l", limit]
          }
        ]
      : [];
  return [
    ...callees,
    {
      role: "uac",
      scenario: load.uac.scenario,
      args: [
        target,
        ...scenarioFlags("uac", load.uac.scenario),
        ...users(load.uac.users),
        "-r",
        n(cps),
        "-rp",
        "1000",
        "-l",
        limit,
        ...hold
      ]
    }
  ];
}

/** Rows of a SIPp injection file: its lines after the first, not blank. */
export function countUserRows(text: string): number {
  return text
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "").length;
}
