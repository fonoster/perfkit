/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { durationToSeconds } from "../analyze/durationToSeconds.js";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import type { BenchmarkConfig } from "../schemas/index.js";
import { type AgentDeps, createRunBenchmark } from "./createRunBenchmark.js";
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
 * `<root>/run.json`, runs every benchmark of the plan in order (the first's
 * compose down before the second's compose up), keeps `status.json`, and
 * writes `raw/<id>/done` per benchmark and `done` at the end. An
 * AgentFailure stops the run: it writes `failed` with the message instead.
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
    const save = async () => {
      await deps.fs.writeFile(`${paths.status}.tmp`, JSON.stringify(status));
      await deps.fs.rename(`${paths.status}.tmp`, paths.status);
    };
    await save();
    const runBenchmark = createRunBenchmark(deps, state);

    const step = async (benchmark: BenchmarkConfig) => {
      status.benchmarks[benchmark.id] = {
        state: "running",
        startedAt: new Date(deps.now()).toISOString(),
        plannedS: plannedSeconds(benchmark)
      };
      await save();
      await runBenchmark(benchmark);
      status.benchmarks[benchmark.id] = {
        ...status.benchmarks[benchmark.id]!,
        state: "done"
      };
      await save();
    };

    try {
      await state.plan.benchmarks.reduce(
        (previous, benchmark) => previous.then(() => step(benchmark)),
        Promise.resolve()
      );
    } catch (err) {
      const message =
        err instanceof AgentFailure
          ? err.message
          : `the agent failed: ${err instanceof Error ? err.message : String(err)}`;
      await deps.fs.writeFile(paths.failed, `${message}\n`);
      status.failed = message;
      status.endedAt = new Date(deps.now()).toISOString();
      await save();
      await deps.log(`perfkit agent: ${message}`);
      return { status: "failed", message };
    }
    status.done = true;
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
