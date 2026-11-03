/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { z } from "zod/v4";
import type { AnalyzeDeps } from "../analyze/index.js";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import type { Now, SignalSource, Sleep } from "../infra/index.js";
import type { BenchmarkResult } from "../schemas/index.js";
import { analyzeBenchmark } from "./analyzeBenchmark.js";
import { buildReport } from "./buildReport.js";
import { collectInputSchema } from "./collect.schema.js";
import {
  CANCELLED,
  CHECK_INTERVAL_MS,
  LOADGEN_UNRESPONSIVE,
  MAX_FAILED_CHECKS,
  nameOf
} from "./constants.js";
import { formatResultLine, formatSpan } from "./formatResultLine.js";
import { runPaths } from "./paths.js";
import {
  type RunState,
  runStateSchema,
  type RunStatus,
  runStatusSchema
} from "./runState.schema.js";
import type { Remote } from "./types.js";

export const EXIT_OK = 0;
export const EXIT_NOT_PASSED = 1;
export const EXIT_INFRA = 3;
export const EXIT_RUNNING = 4;
export const EXIT_CANCELLED = 130;

export interface CollectDeps {
  remote: Remote;
  /** The run's root on the load generator. */
  root: string;
  /** Deletes everything the run created; returns one line per failure. */
  teardown: () => Promise<{ summary: string; failures: string[] }>;
  analyzeDeps: AnalyzeDeps;
  now: Now;
  sleep: Sleep;
  signals: SignalSource;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

type Ending = "done" | "failed" | "timeout" | "unreachable" | "cancelled";

/**
 * Creates `collect`: it follows a run on its load generator, printing the
 * agent's progress lines and downloading each benchmark's raw results as
 * soon as its `done` marker exists. With `wait` it only waits: exit 0 when
 * the run is done, 4 on timeout, 130 on a signal, 3 when the agent failed
 * or the load generator stopped answering; it never deletes. Otherwise,
 * once the run ends it writes report.json, deletes everything and exits 0
 * (every selected benchmark passed) or 1. A signal stops the agent, marks
 * unfinished benchmarks `aborted` (the run was cancelled), and still writes
 * the report and deletes everything (exit 130). Three failed reads of the
 * load generator in a row, 30 s apart, mark them `aborted` (the load
 * generator stopped responding). Without any results, no report: exit 3.
 *
 * @param deps - The remote, teardown, analyzers, clock and output (injected)
 */
export function createCollect(deps: CollectDeps) {
  const paths = runPaths(deps.root);
  const fn = async (
    input: z.output<typeof collectInputSchema>
  ): Promise<number> => {
    const controller = new AbortController();
    let signalled = false;
    const onSignal = () => {
      if (signalled) return;
      signalled = true;
      controller.abort();
    };
    deps.signals.on("SIGINT", onSignal);
    deps.signals.on("SIGTERM", onSignal);
    try {
      return await follow(input, controller.signal, () => signalled);
    } finally {
      deps.signals.off("SIGINT", onSignal);
      deps.signals.off("SIGTERM", onSignal);
    }
  };

  async function follow(
    input: z.output<typeof collectInputSchema>,
    signal: AbortSignal,
    isCancelled: () => boolean
  ): Promise<number> {
    const runDir = join(input.out, input.runId);
    const deadline =
      input.timeoutMs === null ? Infinity : deps.now() + input.timeoutMs;
    // Raw results already here (from an earlier wait job's artifact) count.
    const local = await readdir(join(runDir, "raw")).catch(
      () => [] as string[]
    );
    const present = await Promise.all(
      local.map(async (id) =>
        (await stat(join(runDir, "raw", id, "done")).catch(() => null))
          ? id
          : null
      )
    );
    const downloaded = new Set<string>(
      present.filter((id): id is string => id !== null)
    );
    let printed = 0;
    let state: RunState | null = null;
    let status: RunStatus | null = null;
    let failedReads = 0;

    const read = async (readSignal?: AbortSignal): Promise<boolean> => {
      const out = await deps.remote.exec(
        "loadgen",
        `cat ${paths.runJson}; echo; echo '@@status'; cat ${paths.status} 2>/dev/null; echo; echo '@@progress'; tail -n +${printed + 1} ${paths.progress} 2>/dev/null; true`,
        { timeoutMs: 60 * 1000, signal: readSignal }
      );
      if (out.code !== 0) return false;
      const [runText = "", rest = ""] = out.stdout.split("\n@@status\n");
      const [statusText = "", progress = ""] = rest.split("\n@@progress\n");
      try {
        state ??= runStateSchema.parse(JSON.parse(runText));
      } catch {
        return false;
      }
      try {
        if (statusText.trim() !== "") {
          status = runStatusSchema.parse(JSON.parse(statusText));
        }
      } catch {
        // A status being rewritten; the next read gets it.
      }
      const lines = progress.split("\n").filter((line) => line !== "");
      lines.forEach((line) => deps.stdout(`${line}\n`));
      printed += lines.length;
      const current = status as RunStatus | null;
      const done = Object.entries(current?.benchmarks ?? {})
        .filter(([id, { state }]) => state === "done" && !downloaded.has(id))
        .map(([id]) => id);
      await done.reduce(
        (previous, id) =>
          previous.then(async () => {
            const target = join(runDir, "raw", id);
            await rm(target, { recursive: true, force: true });
            await mkdir(dirname(target), { recursive: true });
            await deps.remote.download("loadgen", paths.rawOf(id), target);
            downloaded.add(id);
          }),
        Promise.resolve()
      );
      return true;
    };

    const loop = async (): Promise<Ending> => {
      if (isCancelled()) return "cancelled";
      const ok = await read(signal).catch(() => false);
      if (isCancelled()) return "cancelled";
      failedReads = ok ? 0 : failedReads + 1;
      if (failedReads >= MAX_FAILED_CHECKS) return "unreachable";
      const current = status as RunStatus | null;
      if (current?.failed) return "failed";
      if (current?.done) return "done";
      if (deps.now() >= deadline) return "timeout";
      await deps.sleep(
        Math.max(1, Math.min(CHECK_INTERVAL_MS, deadline - deps.now())),
        signal
      );
      return loop();
    };

    const ending = await loop();
    const current = status as RunStatus | null;
    const known = state as RunState | null;

    if (ending === "timeout") {
      const running = Object.entries(current?.benchmarks ?? {}).find(
        ([, { state }]) => state === "running"
      );
      deps.stdout(
        running
          ? `[${running[0]}] running, ${formatSpan(deps.now() - Date.parse(running[1].startedAt ?? ""))} of ${formatSpan((running[1].plannedS ?? 0) * 1000)}\n`
          : `run ${input.runId} is still running\n`
      );
      return EXIT_RUNNING;
    }
    if (input.wait) {
      if (ending === "done") return EXIT_OK;
      if (ending === "cancelled") return EXIT_CANCELLED;
      deps.stderr(
        `perfkit: ${ending === "failed" ? current?.failed : LOADGEN_UNRESPONSIVE}; nothing was deleted\n`
      );
      return EXIT_INFRA;
    }

    if (ending === "cancelled" && known) {
      await deps.remote
        .exec(
          "loadgen",
          `docker rm -f ${nameOf(known.namePrefix, known.runId, "agent")} >/dev/null 2>&1; true`,
          { timeoutMs: 60 * 1000 }
        )
        .catch(() => undefined);
      await read().catch(() => false);
    }

    const finish = async (code: number): Promise<number> => {
      const { summary, failures } = await deps.teardown();
      if (summary) deps.stdout(`${summary}\n`);
      failures.forEach((line) => deps.stderr(`perfkit: ${line}\n`));
      return failures.length > 0 ? EXIT_INFRA : code;
    };

    if (ending === "failed" || known === null) {
      deps.stderr(
        `perfkit: ${current?.failed ?? LOADGEN_UNRESPONSIVE}; no report was written\n`
      );
      return finish(ending === "cancelled" ? EXIT_CANCELLED : EXIT_INFRA);
    }

    const run = known;
    const reason =
      ending === "cancelled"
        ? CANCELLED
        : ending === "unreachable"
          ? LOADGEN_UNRESPONSIVE
          : null;
    const tool = `SIPp ${run.tools.sipp.replace(/-.*$/, "")}, UDP`;
    const results = new Map<string, BenchmarkResult>();
    await run.plan.benchmarks.reduce(
      (previous, benchmark) =>
        previous.then(async () => {
          const has = downloaded.has(benchmark.id);
          const result = await analyzeBenchmark(
            deps.analyzeDeps,
            benchmark,
            join(runDir, "raw", benchmark.id),
            has ? null : { reason: reason ?? "the agent left no results" },
            tool
          );
          results.set(benchmark.id, result);
          deps.stdout(`${formatResultLine(result)}\n`);
        }),
      Promise.resolve()
    );

    if (downloaded.size === 0) {
      deps.stderr(
        "perfkit: no benchmark produced results; no report was written\n"
      );
      return finish(ending === "cancelled" ? EXIT_CANCELLED : EXIT_INFRA);
    }
    const endedAt = (
      current?.endedAt ?? new Date(deps.now()).toISOString()
    ).replace(/\.\d{3}Z$/, "Z");
    const report = buildReport(run, results, endedAt);
    const file = join(runDir, "report.json");
    await mkdir(runDir, { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
    const selected = [...results.values()];
    const passed = selected.filter(
      ({ verdict }) => verdict === "passed"
    ).length;
    const code = await finish(
      ending === "cancelled"
        ? EXIT_CANCELLED
        : passed === selected.length
          ? EXIT_OK
          : EXIT_NOT_PASSED
    );
    deps.stdout(
      `report ${file}  (${report.verdict.passed} of ${report.verdict.total} benchmarks passed)\n`
    );
    return code;
  }

  return withErrorHandlingAndValidation(fn, collectInputSchema);
}
