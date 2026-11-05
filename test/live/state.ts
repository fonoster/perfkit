/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { LiveBenchmarkRecord, LiveRecord } from "../../src/live/types.js";
import type { RunState } from "../../src/orchestrate/runState.schema.js";
import {
  type CapacityBenchmarkConfig,
  type LivePoint,
  perfkitConfigSchema,
  type SoakBenchmarkConfig
} from "../../src/schemas/index.js";
import { loadConfig } from "../fixtures.js";

export const RUN_ID = "20261106T140212Z-bd3254a";
export const STARTED_MS = Date.parse("2026-11-06T14:02:12Z");
export const MIN = 60_000;

const config = perfkitConfigSchema.parse(loadConfig());
export const CAPACITY = config.benchmarks[0] as CapacityBenchmarkConfig;
export const SOAK = config.benchmarks[1] as SoakBenchmarkConfig;

/** The Routr example's run state, both benchmarks selected unless told. */
export function runState(
  overrides: { mode?: "digitalocean" | "local"; selected?: string[] } = {}
): RunState {
  const selected = overrides.selected ?? [CAPACITY.id, SOAK.id];
  return {
    runId: RUN_ID,
    mode: overrides.mode ?? "digitalocean",
    root: "/opt/perfkit",
    namePrefix: "perfkit",
    perfkitVersion: "0.2.0",
    command: "perfkit run",
    plan: {
      runId: RUN_ID,
      project: "Routr",
      targetVersion: "2.32.2",
      commit: "bd3254a4f0000000000000000000000000000000",
      startedAt: "2026-11-06T14:02:12Z",
      region: "nyc3",
      resourceName: `perfkit-${RUN_ID}`,
      runTag: `perfkit-run-${RUN_ID}`,
      tags: ["perfkit"],
      uut: { name: "uut", size: "c-8", image: "ubuntu-22-04-x64" },
      loadgen: { name: "loadgen", size: "c-16", image: "ubuntu-22-04-x64" },
      sshSource: "203.0.113.7/32",
      images: [],
      benchmarks: config.benchmarks.filter(({ id }) => selected.includes(id)),
      maxLifetime: "9h"
    },
    config,
    hosts: { uutIp: "10.0.0.2", loadgenIp: "10.0.0.3", vpcCidr: "10.0.0.0/24" },
    machines: {
      uut: { vcpus: 8, memoryMB: 16000, os: "Ubuntu", docker: "27" },
      loadgen: { vcpus: 16, memoryMB: 32000, os: "Ubuntu", docker: "27" }
    },
    tools: { sipp: "3.7.3" }
  } as unknown as RunState;
}

export function point(offeredCps: number, ok = true): LivePoint {
  return {
    offeredCps,
    achievedCps: offeredCps,
    calls: offeredCps * 60,
    failed: 0,
    p50Ms: 2,
    p95Ms: 4,
    p99Ms: ok ? 8 : 62,
    failedPct: 0,
    ok,
    stopReason: ok ? null : "over the p99 limit"
  };
}

export function record(
  benchmarks: Record<string, Partial<LiveBenchmarkRecord>> = {},
  status: LiveRecord["status"] = "running"
): LiveRecord {
  return {
    status,
    reason: status === "failed" ? "the agent failed: boom" : null,
    benchmarks: Object.fromEntries(
      Object.entries(benchmarks).map(([id, value]) => [
        id,
        {
          startedMs: null,
          loadStartedMs: null,
          endedMs: null,
          points: [],
          ...value
        }
      ])
    )
  };
}
