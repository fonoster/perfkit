/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Builds raw results directories in memory for the analyzer tests: perfkit
 * configs, SIPp stat and rtt files in SIPp 3.7's format, sampler.jsonl,
 * udp.jsonl and meta.json.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sinon from "sinon";
import type { AnalyzeDeps } from "../../src/analyze/index.js";
import {
  capacityBenchmarkConfigSchema,
  soakBenchmarkConfigSchema
} from "../../src/schemas/index.js";
import { ROOT } from "../fixtures.js";

export const FIXTURES = join(ROOT, "test", "fixtures");
export const START_MS = Date.parse("2026-11-03T14:00:00Z");
export const RAW_DIR = "/out/run/raw/bench";

const iso = (ms: number) => new Date(ms).toISOString();

/** Deps serving `files` as the only directory, `RAW_DIR`. */
export function fakeDeps(files: Record<string, string>): AnalyzeDeps & {
  readFile: sinon.SinonStub;
  readdir: sinon.SinonStub;
} {
  const readdir = sinon.stub().callsFake(async (dir: string) => {
    if (dir !== RAW_DIR) {
      throw Object.assign(new Error(`ENOENT: ${dir}`), { code: "ENOENT" });
    }
    return Object.keys(files);
  });
  const readFile = sinon.stub().callsFake(async (path: string) => {
    const name = path.slice(RAW_DIR.length + 1);
    const text = files[name];
    if (!path.startsWith(`${RAW_DIR}/`) || text === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }
    return text;
  });
  return { readFile, readdir };
}

/** Every file of a committed fixture directory, by name. */
export function readFixtureDir(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(FIXTURES, dir)).map((name) => [
      name,
      readFileSync(join(FIXTURES, dir, name), "utf8")
    ])
  );
}

const narrative = { what: "What.", why: "Why.", how: "How." };

export function capacityConfig(
  overrides: {
    p99LatencyMs?: number;
    failedCallsPct?: number;
    confirmSteps?: number;
    max?: number;
  } = {},
  extra: Record<string, unknown> = {}
) {
  return capacityBenchmarkConfigSchema.parse({
    id: "edgeport-echo",
    kind: "capacity",
    title: "EdgePort + Echo",
    narrative,
    uut: {
      compose: "edgeport-echo/compose.yaml",
      processes: [
        { name: "edgeport", match: "io\\.routr\\.Launcher" },
        { name: "echo", match: "/usr/local/bin/run" }
      ]
    },
    load: {
      tool: "sipp",
      transport: "udp",
      unit: "messages",
      uac: { scenario: "edgeport-echo/uac_message.xml" },
      rate: { start: 50, step: 50, every: "60s", max: overrides.max ?? 5000 }
    },
    thresholds: {
      p99LatencyMs: overrides.p99LatencyMs ?? 50,
      failedCallsPct: overrides.failedCallsPct ?? 0.1,
      confirmSteps: overrides.confirmSteps ?? 1
    },
    ...extra
  });
}

export function soakConfig(
  overrides: {
    duration?: string;
    warmup?: string;
    settle?: string;
    memoryGrowthMBPerHour?: number;
    otlp?: boolean;
  } = {}
) {
  return soakBenchmarkConfigSchema.parse({
    id: "one-soak",
    kind: "soak",
    title: "RoutrOne",
    narrative,
    duration: overrides.duration ?? "2h",
    warmup: overrides.warmup ?? "30m",
    ...(overrides.settle ? { settle: overrides.settle } : {}),
    uut: {
      compose: "one-soak/compose.yaml",
      processes: [
        { name: "one", match: "dist/runner" },
        { name: "edgeport", match: "io\\.routr\\.Launcher" },
        { name: "postgres", match: "postgres" }
      ]
    },
    load: {
      tool: "sipp",
      transport: "udp",
      register: {
        scenario: "one-soak/uac_register.xml",
        users: "one-soak/callees.csv"
      },
      uas: { scenario: "one-soak/uas_answer.xml" },
      uac: {
        scenario: "one-soak/uac_invite.xml",
        users: "one-soak/callers.csv"
      },
      hold: "30s",
      rate: { cps: 100 }
    },
    telemetry: { otlp: overrides.otlp ?? false, sampleRatio: 0.01 },
    thresholds: {
      memoryGrowthMBPerHour: overrides.memoryGrowthMBPerHour ?? 5,
      failedCallsPct: 0.1,
      restarts: 0
    }
  });
}

export interface StatRowSpec {
  tMs: number;
  counters: Record<string, number>;
}

/** A -trace_stat file as SIPp 3.7 writes it. */
export function statCsv(startMs: number, rows: StatRowSpec[]): string {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row.counters)))];
  const time = (ms: number) => {
    const date = new Date(ms).toISOString();
    return `${date.slice(0, 10)}\t${date.slice(11, 23)}000\t${(ms / 1000).toFixed(6)}`;
  };
  const header = [
    "StartTime",
    "LastResetTime",
    "CurrentTime",
    "ElapsedTime(P)",
    ...names,
    "ResponseTime1(P)",
    ""
  ].join(";");
  const lines = rows.map((row) =>
    [
      time(startMs),
      time(row.tMs),
      time(row.tMs),
      "00:00:10",
      ...names.map((name) => String(row.counters[name] ?? 0)),
      "00:00:00:000000",
      ""
    ].join(";")
  );
  return [header, ...lines].join("\n") + "\n";
}

/** A -trace_rtt file: one row per call, times relative to SIPp's start. */
export function rttCsv(
  startMs: number,
  calls: Array<{ sentMs: number; latencyMs: number }>
): string {
  return (
    [
      "Date_ms;response_time_ms;rtd_no",
      ...calls.map(
        ({ sentMs, latencyMs }) =>
          `${(sentMs + latencyMs - startMs).toFixed(3)};${latencyMs};1`
      )
    ].join("\n") + "\n"
  );
}

export interface SamplerSpec {
  host: "uut" | "loadgen" | `worker-${number}`;
  name: string;
  pid?: number;
  rssKB?: number;
  cpuTicks?: number;
  fds?: number;
}

/** sampler.jsonl lines at one time. */
export function samplerLines(tMs: number, specs: SamplerSpec[]): string[] {
  return specs.map((spec) =>
    JSON.stringify({
      t: iso(tMs),
      host: spec.host,
      name: spec.name,
      pid: spec.pid ?? 41,
      rssKB: spec.rssKB ?? 102400,
      cpuTicks: spec.cpuTicks ?? 0,
      clkTck: 100,
      fds: spec.fds ?? 100
    })
  );
}

export function udpLine(
  tMs: number,
  host: "uut" | "loadgen" | `worker-${number}`,
  RcvbufErrors = 0
): string {
  return JSON.stringify({
    t: iso(tMs),
    host,
    RcvbufErrors,
    SndbufErrors: 0,
    InErrors: RcvbufErrors
  });
}

export interface CapacityStepSpec {
  offeredCps: number;
  /** One latency per measured call, ms. Default 100 calls at 5 ms. */
  latencies?: number[];
  attempted?: number;
  failed?: number;
  failuresByReason?: Record<string, number>;
  retransmissions?: number;
  sippCpuPct?: number;
  loadgenDrops?: number;
}

export const STEP_MS = 60_000;
const TICK_MS = 10_000;

/**
 * A capacity raw results directory: one 60 s step per spec, stat rows and
 * sampler and UDP readings every 10 s, the UUT at 50% CPU per process.
 */
export function capacityRaw(steps: CapacityStepSpec[]): Record<string, string> {
  const ticks = steps.length * (STEP_MS / TICK_MS);
  const stepAt = (tick: number) =>
    steps[
      Math.min(steps.length - 1, Math.floor((tick - 1) / 6))
    ] as CapacityStepSpec;

  const statRows: StatRowSpec[] = [
    { tMs: START_MS, counters: { "OutgoingCall(P)": 0, "FailedCall(P)": 0 } },
    ...Array.from({ length: ticks }, (_, i) => {
      const tick = i + 1;
      const step = stepAt(tick);
      const first = (tick - 1) % 6 === 0;
      const attempted = step.attempted ?? step.offeredCps * 60;
      const share = Math.floor(attempted / 6);
      const reasons = Object.fromEntries(
        Object.entries(step.failuresByReason ?? {}).map(([name, n]) => [
          `${name}(P)`,
          first ? n : 0
        ])
      );
      return {
        tMs: START_MS + tick * TICK_MS + 3,
        counters: {
          "OutgoingCall(P)": first ? attempted - share * 5 : share,
          "FailedCall(P)": first ? (step.failed ?? 0) : 0,
          "Retransmissions(P)": first ? (step.retransmissions ?? 0) : 0,
          CurrentCall: step.offeredCps,
          ...reasons
        }
      };
    })
  ];
  const calls = steps.flatMap((step, index) => {
    const latencies = step.latencies ?? Array.from({ length: 100 }, () => 5);
    const fromMs = START_MS + index * STEP_MS;
    return latencies.map((latencyMs, k) => ({
      sentMs: fromMs + 1 + Math.floor((k * (STEP_MS - 2)) / latencies.length),
      latencyMs
    }));
  });

  const cumulative = Array.from({ length: ticks + 1 }, (_, tick) =>
    Array.from({ length: tick }, (_, i) => stepAt(i + 1)).reduce(
      (acc, step) => ({
        sipp: acc.sipp + ((step.sippCpuPct ?? 10) / 100) * 10 * 100,
        drops: acc.drops + (step.loadgenDrops ?? 0) / 6
      }),
      { sipp: 0, drops: 0 }
    )
  );
  const sampler = cumulative.flatMap((acc, tick) =>
    samplerLines(START_MS + tick * TICK_MS, [
      { host: "loadgen", name: "sipp-uac", cpuTicks: Math.round(acc.sipp) },
      { host: "uut", name: "edgeport", cpuTicks: tick * 500 },
      { host: "uut", name: "echo", cpuTicks: tick * 500 }
    ])
  );
  const udp = cumulative.flatMap((acc, tick) => [
    udpLine(START_MS + tick * TICK_MS, "loadgen", Math.ceil(acc.drops)),
    udpLine(START_MS + tick * TICK_MS, "uut")
  ]);
  const meta = {
    startedAt: iso(START_MS),
    endedAt: iso(START_MS + steps.length * STEP_MS),
    kind: "capacity",
    durationS: steps.length * 60,
    tool: "SIPp 3.7.3, UDP",
    steps: steps.map((step, index) => ({
      offeredCps: step.offeredCps,
      from: iso(START_MS + index * STEP_MS),
      to: iso(START_MS + (index + 1) * STEP_MS)
    }))
  };
  return {
    "meta.json": JSON.stringify(meta),
    "uac_message_7_.csv": statCsv(START_MS, statRows),
    "uac_message_7_rtt.csv": rttCsv(START_MS, calls),
    "sampler.jsonl": sampler.join("\n") + "\n",
    "udp.jsonl": udp.join("\n") + "\n"
  };
}

/** 100 latencies whose nearest-rank p99 is `p99`; the rest are 5 ms. */
export function latenciesWithP99(p99: number): number[] {
  return [...Array.from({ length: 98 }, () => 5), p99, p99 + 10];
}

/** The error a promise rejects with; fails the test when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject");
}

/** The error a function throws; fails the test when it returns. */
export function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the function to throw");
}

export interface SoakRawSpec {
  warmupS: number;
  /** How long the samples go on after the warm-up, s. */
  afterS: number;
  /** Samples taken after the load ended (meta.endedAt), s. Default 0. */
  tailS?: number;
  /**
   * A process's reading at `hours` since the warm-up ended (negative during
   * it), or null when the sampler did not find it. Default: pid 41, 100 MB.
   */
  processAt?: (name: string, hours: number) => Partial<SamplerSpec> | null;
  /** Failed calls per 10-minute stat row after the warm-up, of 60,000. */
  failedPerRow?: number;
  registerFailedPerRow?: number;
  /** Calls the uac starts per stat row after the warm-up. Default 60,000. */
  callsPerRow?: number;
  /** Leave out the uac's -trace_rtt file. */
  noRtt?: boolean;
  /** The register role's 200 OKs in its counts file. Default: 200, all. */
  registered?: number;
}

export const SOAK_PROCESSES = ["one", "edgeport", "postgres"];
const SOAK_TICK_MS = 60_000;
const SOAK_STAT_MS = 600_000;

/** A soak raw results directory, sampled every minute. */
export function soakRaw(spec: SoakRawSpec): Record<string, string> {
  const warmupEndMs = START_MS + spec.warmupS * 1000;
  const endMs = warmupEndMs + spec.afterS * 1000;
  const ticks = Math.floor((endMs - START_MS) / SOAK_TICK_MS);
  const tailTicks = Math.floor(((spec.tailS ?? 0) * 1000) / SOAK_TICK_MS);
  const sampler = Array.from({ length: ticks + tailTicks + 1 }, (_, i) => {
    const tMs = START_MS + i * SOAK_TICK_MS;
    const hours = (tMs - warmupEndMs) / 3_600_000;
    return samplerLines(
      tMs,
      SOAK_PROCESSES.flatMap((name) => {
        const reading = spec.processAt
          ? spec.processAt(name, hours)
          : { pid: 41, rssKB: 102400 };
        return reading === null
          ? []
          : [{ host: "uut" as const, name, cpuTicks: i * 600, ...reading }];
      })
    );
  }).flat();
  const statRows = (
    failedAfter: number,
    failedDuring: number,
    callsAfter = 60_000
  ) =>
    Array.from(
      { length: Math.floor((endMs - START_MS) / SOAK_STAT_MS) + 1 },
      (_, i) => {
        const tMs = START_MS + i * SOAK_STAT_MS;
        const after = tMs - SOAK_STAT_MS / 2 >= warmupEndMs;
        return {
          tMs,
          counters: {
            "OutgoingCall(P)": i === 0 ? 0 : after ? callsAfter : 60_000,
            "FailedCall(P)": i === 0 ? 0 : after ? failedAfter : failedDuring,
            "Retransmissions(P)": 0,
            CurrentCall: i === 0 ? 0 : after ? 3000 : 3500
          }
        };
      }
    );
  // One call a minute: 4 ms in the first hour after the warm-up, 9 ms later.
  const calls = Array.from({ length: ticks }, (_, i) => {
    const sentMs = START_MS + i * SOAK_TICK_MS + 500;
    return {
      sentMs,
      latencyMs: sentMs < warmupEndMs + 3_600_000 ? 4 : 9
    };
  });
  const meta = {
    startedAt: iso(START_MS),
    endedAt: iso(endMs),
    kind: "soak",
    durationS: (endMs - START_MS) / 1000,
    tool: "SIPp 3.7.3, UDP",
    load: { cps: 100, holdS: 30 },
    registerUsers: 200
  };
  return {
    "meta.json": JSON.stringify(meta),
    "uac_invite_9_.csv": statCsv(
      START_MS,
      statRows(spec.failedPerRow ?? 0, 50, spec.callsPerRow)
    ),
    ...(spec.noRtt ? {} : { "uac_invite_9_rtt.csv": rttCsv(START_MS, calls) }),
    "uac_register_8_.csv": statCsv(
      START_MS,
      statRows(spec.registerFailedPerRow ?? 0, 7)
    ),
    "uac_register_8_counts.csv": [
      "CurrentTime;ElapsedTime;0_REGISTER_Sent;2_401_Recv;3_REGISTER_Sent;5_200_Recv;",
      `${iso(START_MS)};00:00:10:000000;200;200;200;${spec.registered ?? 200};`,
      ""
    ].join("\n"),
    "uas_answer_10_.csv": statCsv(START_MS, statRows(0, 0)),
    "sampler.jsonl": sampler.join("\n") + "\n"
  };
}
