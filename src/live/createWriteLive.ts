/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { basename } from "node:path";
import { parseSamplerJsonl } from "../analyze/parseSamplerJsonl.js";
import { parseStatCsv } from "../analyze/parseStatCsv.js";
import { sumStatRows } from "../analyze/sumStatRows.js";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import type { Now } from "../infra/index.js";
import { runPaths } from "../orchestrate/paths.js";
import { toKubeSamplerLines } from "../orchestrate/toKubeSamplerLines.js";
import type { RunState } from "../orchestrate/runState.schema.js";
import type { AgentFs, HostShell } from "../orchestrate/types.js";
import {
  isHelmUut,
  type Live,
  liveSchema,
  type SoakBenchmarkConfig
} from "../schemas/index.js";
import { buildLiveSnapshot } from "./buildLiveSnapshot.js";
import type { LiveRecorder, SoakProgress } from "./types.js";
import {
  type WriteLiveInput,
  writeLiveInputSchema
} from "./writeLive.schema.js";

const ALL_TIME = { fromMs: 0, toMs: Number.POSITIVE_INFINITY };
const completeLines = (text: string) =>
  text.slice(0, text.lastIndexOf("\n") + 1);

/**
 * Creates `writeLive()`, which writes the run's live.json atomically (a
 * temporary file, then a rename) from what the agent recorded. For a soak
 * whose load has started it reads the UUT's sampler file (on this machine
 * with --local; over SSH otherwise, only the bytes added since the last
 * read) and the uac's SIPp counters. A file it can't read leaves the last
 * numbers in place: live.json never stops the run.
 *
 * @param deps - The agent's file system and host shell, the clock, the run
 *   state and the recorder (injected)
 * @returns A validated function that returns the snapshot it wrote
 */
export function createWriteLive(deps: {
  fs: AgentFs;
  shell: HostShell;
  now: Now;
  state: RunState;
  recorder: LiveRecorder;
}) {
  const { fs, shell, state } = deps;
  const paths = runPaths(state.root);
  const sampler = new Map<string, { offset: number; text: string }>();
  const progress = new Map<string, SoakProgress>();

  const readSampler = async (id: string): Promise<string> => {
    const benchmark = state.plan.benchmarks.find((b) => b.id === id);
    if (benchmark && isHelmUut(benchmark.uut)) {
      // The cluster sampler writes on the load generator, this machine.
      return toKubeSamplerLines(
        await fs.readFile(`${paths.rawOf(id)}/kube-uut.jsonl`)
      );
    }
    const file = `${paths.rawOf(id)}/sampler-uut.jsonl`;
    if (state.mode === "local") return fs.readFile(file);
    const seen = sampler.get(id) ?? { offset: 0, text: "" };
    const out = await shell(
      "uut",
      `tail -c +${seen.offset + 1} ${file} 2>/dev/null; true`,
      { timeoutMs: 60 * 1000 }
    );
    const next = {
      offset: seen.offset + Buffer.byteLength(out.stdout),
      text: seen.text + out.stdout
    };
    sampler.set(id, next);
    return next.text;
  };

  const readCalls = async (benchmark: SoakBenchmarkConfig) => {
    const rawDir = paths.rawOf(benchmark.id);
    const base = basename(benchmark.load.uac.scenario).replace(/\.xml$/i, "");
    const pattern = new RegExp(
      `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d+_\\.csv$`
    );
    const names = (await fs.readdir(rawDir)).filter((name) =>
      pattern.test(name)
    );
    const sums = await Promise.all(
      names.map(async (name) => {
        const text = completeLines(await fs.readFile(`${rawDir}/${name}`));
        return sumStatRows(parseStatCsv(text, name).rows, ALL_TIME);
      })
    );
    return {
      placed: sums.reduce((total, sum) => total + sum.attempted, 0),
      failed: sums.reduce((total, sum) => total + sum.failed, 0)
    };
  };

  const readSoak = async (benchmark: SoakBenchmarkConfig) => {
    const previous = progress.get(benchmark.id) ?? {
      samples: [],
      placed: 0,
      failed: 0
    };
    const samples = await readSampler(benchmark.id)
      .then((text) =>
        parseSamplerJsonl(completeLines(text), "sampler-uut.jsonl").filter(
          (sample) => sample.host === "uut"
        )
      )
      .catch(() => previous.samples);
    const calls = await readCalls(benchmark).catch(() => previous);
    progress.set(benchmark.id, {
      samples,
      placed: calls.placed,
      failed: calls.failed
    });
  };

  const fn = async (_input: WriteLiveInput): Promise<Live> => {
    const record = deps.recorder.read();
    const soaks = state.plan.benchmarks.filter(
      (benchmark): benchmark is SoakBenchmarkConfig =>
        benchmark.kind === "soak" &&
        record.benchmarks[benchmark.id]?.loadStartedMs != null &&
        (record.benchmarks[benchmark.id]?.endedMs == null ||
          !progress.has(benchmark.id))
    );
    await Promise.all(soaks.map(readSoak));
    const snapshot = liveSchema.parse(
      buildLiveSnapshot({ state, record, nowMs: deps.now(), soaks: progress })
    );
    await fs.writeFile(`${paths.live}.tmp`, `${JSON.stringify(snapshot)}\n`);
    await fs.rename(`${paths.live}.tmp`, paths.live);
    return snapshot;
  };

  return withErrorHandlingAndValidation(fn, writeLiveInputSchema);
}
