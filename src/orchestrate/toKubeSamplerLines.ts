/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { parseKubeQuantity } from "./parseKubeQuantity.js";

/** The clock ticks per second of the sampler lines it writes. */
export const KUBE_CLK_TCK = 100;

const kubeLineSchema = z.object({
  t: z.string(),
  name: z.string().min(1),
  pods: z.array(
    z.object({ pod: z.string(), uid: z.string(), restarts: z.number() })
  ),
  metrics: z.array(
    z.object({
      pod: z.string(),
      cpu: z.array(z.string()),
      memory: z.array(z.string())
    })
  )
});

type KubeLine = z.infer<typeof kubeLineSchema>;

interface NameState {
  lastMs: number | null;
  ticks: number;
  restarts: number;
  seen: Map<string, number>;
}

/**
 * Turns the cluster sampler's `kube-uut.jsonl` into sampler lines of the
 * unit under test, one per name and tick, in the format the analyzers read:
 * memory is the pods' working set summed (`rssKB`); CPU is their usage
 * summed and integrated over time into `cpuTicks` at 100 ticks/s, so CPU %
 * over a window comes out as on the server; `pid` is 1 plus the restarts of
 * the name's containers seen so far, so a restart reads as one; `fds` is 0.
 * A tick with no pod, no usage yet or a line that does not parse (the last
 * one, half written) gives no line.
 */
export function toKubeSamplerLines(text: string): string {
  const lines = text
    .split("\n")
    .flatMap((line): KubeLine[] => {
      if (line.trim() === "") return [];
      try {
        const parsed = kubeLineSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    })
    .filter((line) => !Number.isNaN(Date.parse(line.t)));
  const states = new Map<string, NameState>();
  return lines
    .flatMap((line) => {
      const state = states.get(line.name) ?? {
        lastMs: null,
        ticks: 0,
        restarts: 0,
        seen: new Map<string, number>()
      };
      states.set(line.name, state);
      const first = state.lastMs === null;
      line.pods.forEach(({ uid, restarts }) => {
        const before = state.seen.get(uid);
        const added =
          before === undefined ? (first ? 0 : restarts) : restarts - before;
        state.restarts += Math.max(0, added);
        state.seen.set(uid, restarts);
      });
      const pods = new Set(line.pods.map(({ pod }) => pod));
      const usage = line.metrics.filter(({ pod }) => pods.has(pod));
      if (pods.size === 0 || usage.length === 0) return [];
      const sum = (values: string[]) =>
        values.reduce(
          (total, value) => total + (parseKubeQuantity(value) ?? 0),
          0
        );
      const cores = usage.reduce((total, { cpu }) => total + sum(cpu), 0);
      const bytes = usage.reduce((total, { memory }) => total + sum(memory), 0);
      const tMs = Date.parse(line.t);
      if (state.lastMs !== null && tMs > state.lastMs) {
        state.ticks += cores * ((tMs - state.lastMs) / 1000) * KUBE_CLK_TCK;
      }
      state.lastMs = tMs;
      return [
        JSON.stringify({
          t: line.t,
          host: "uut",
          name: line.name,
          pid: 1 + state.restarts,
          rssKB: Math.round(bytes / 1024),
          cpuTicks: Math.round(state.ticks),
          clkTck: KUBE_CLK_TCK,
          fds: 0
        })
      ];
    })
    .map((line) => `${line}\n`)
    .join("");
}
