/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  type BenchmarkConfig,
  type SoakBenchmarkConfig,
  targetOf
} from "../schemas/index.js";
import { analyzeBenchmark } from "./analyzeBenchmark.js";
import {
  type AgentDeps,
  type BenchmarkRate,
  createRunBenchmark
} from "./createRunBenchmark.js";
import { liveAnalyzeDeps } from "./liveAnalyzeDeps.js";
import { resolveSoakRate } from "./resolveSoakRate.js";
import { AgentFailure } from "./errors.js";
import { runPaths } from "./paths.js";
import {
  type AgentInput,
  agentInputSchema,
  type RunState,
  runStateSchema,
  type RunStatus
} from "./runState.schema.js";

export type AgentOutcome =
  { status: "done" } | { status: "failed"; message: string };

/**
 * Creates the agent, `perfkit agent --run <id>`, which drives the load from
 * the load generator so the CLI machine can disconnect. It reads
 * `<root>/run.json` and runs every capacity benchmark of the plan, one
 * after another in plan order (the first's compose down before the
 * second's compose up), then every soak: the soaks of different targets
 * (the server, the cluster) at the same time, those of one target one
 * after another. A soak with `rate.fromCapacity` runs at that fraction of
 * the capacity benchmark's limit, or at `fallbackCps`. It keeps
 * `status.json`, and writes `raw/<id>/done` per benchmark and `done` at the
 * end. An AgentFailure stops the run: it writes `failed` with the message
 * instead.
 *
 * @param deps - Host shell, file system, clock and log (injected)
 */
export function createAgent(deps: AgentDeps) {
  const fn = async ({ root, runId }: AgentInput): Promise<AgentOutcome> => {
    const paths = runPaths(root);
    const state: RunState = runStateSchema.parse(
      JSON.parse(await deps.fs.readFile(paths.runJson))
    );
    if (state.runId !== runId) {
      throw new Error(
        `${paths.runJson} is for run ${state.runId}, not ${runId}`
      );
    }
    const status: RunStatus = {
      benchmarks: Object.fromEntries(
        state.plan.benchmarks.map(({ id }) => [
          id,
          { state: "pending" as const }
        ])
      ),
      done: false,
      failed: null
    };
    // Soaks run at the same time, so saves are queued: one temporary file
    // at a time.
    let saving = Promise.resolve();
    const save = () => {
      saving = saving
        .catch(() => undefined)
        .then(async () => {
          await deps.fs.writeFile(
            `${paths.status}.tmp`,
            JSON.stringify(status)
          );
          await deps.fs.rename(`${paths.status}.tmp`, paths.status);
        });
      return saving;
    };
    await save();
    const runBenchmark = createRunBenchmark(deps, state);

    const limits = new Map<string, number | null>();
    const step = async (benchmark: BenchmarkConfig, rate?: BenchmarkRate) => {
      status.benchmarks[benchmark.id] = {
        state: "running",
        startedAt: new Date(deps.now()).toISOString(),
        plannedS: plannedSeconds(benchmark)
      };
      await save();
      deps.live?.started(benchmark.id, deps.now());
      await runBenchmark(benchmark, rate);
      deps.live?.done(benchmark.id, deps.now());
      status.benchmarks[benchmark.id] = {
        ...status.benchmarks[benchmark.id]!,
        state: "done"
      };
      await save();
    };

    const inOrder = <T>(
      items: readonly T[],
      each: (item: T) => Promise<void>
    ) =>
      items.reduce(
        (previous, item) => previous.then(() => each(item)),
        Promise.resolve()
      );
    const tool = `SIPp ${state.tools.sipp.replace(/-.*$/, "")}`;
    const capacity = async (benchmark: BenchmarkConfig) => {
      await step(benchmark);
      const result = await analyzeBenchmark(
        liveAnalyzeDeps(deps.fs),
        benchmark,
        paths.rawOf(benchmark.id),
        null,
        tool
      ).catch(() => null);
      limits.set(
        benchmark.id,
        result?.verdict === "passed" && "headline" in result
          ? (result.headline as { limitCps: number | null }).limitCps
          : null
      );
    };
    const soak = async (benchmark: SoakBenchmarkConfig) => {
      const resolved = resolveSoakRate(benchmark, limits);
      if (resolved) await deps.log(resolved.line);
      await step(
        benchmark,
        resolved
          ? { cps: resolved.cps, rateSource: resolved.rateSource }
          : undefined
      );
    };
    const soaks = state.plan.benchmarks.filter(
      (benchmark): benchmark is SoakBenchmarkConfig => benchmark.kind === "soak"
    );
    const lanes = [...new Set(soaks.map(targetOf))].map((target) =>
      soaks.filter((benchmark) => targetOf(benchmark) === target)
    );

    try {
      await inOrder(
        state.plan.benchmarks.filter(({ kind }) => kind === "capacity"),
        capacity
      );
      await Promise.all(lanes.map((lane) => inOrder(lane, soak)));
    } catch (err) {
      const message =
        err instanceof AgentFailure
          ? err.message
          : `the agent failed: ${err instanceof Error ? err.message : String(err)}`;
      await deps.fs.writeFile(paths.failed, `${message}\n`);
      status.failed = message;
      deps.live?.failed(message);
      status.endedAt = new Date(deps.now()).toISOString();
      await save();
      await deps.log(`perfkit agent: ${message}`);
      return { status: "failed", message };
    }
    status.done = true;
    deps.live?.finished();
    status.endedAt = new Date(deps.now()).toISOString();
    await save();
    await deps.fs.writeFile(paths.done, `${status.endedAt}\n`);
    return { status: "done" };
  };

  return withErrorHandlingAndValidation(fn, agentInputSchema);
}

/** The longest a benchmark runs: a whole capacity ramp, or warmup + duration. */
export function plannedSeconds(benchmark: BenchmarkConfig): number {
  if (benchmark.kind === "soak") {
    return (
      durationToSeconds(benchmark.warmup) +
      durationToSeconds(benchmark.duration)
    );
  }
  const { start, step, every, max } = benchmark.load.rate;
  return (Math.floor((max - start) / step) + 1) * durationToSeconds(every);
}
