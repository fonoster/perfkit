/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { OTLP_PORT, SIP_PORTS } from "../infra/constants.js";
import type { Plan } from "../infra/index.js";
import { parseDuration } from "../infra/parseDuration.js";
import type { BenchmarkConfig } from "../schemas/index.js";

const LABEL_WIDTH = 11;

/**
 * The plan as `run` prints it, one aligned line per field:
 *
 * ```
 * plan for Routr 2.31.5 (dry run, nothing created)
 *   region     nyc3, new VPC (range assigned by DigitalOcean)
 *   uut        c-8   ubuntu-24-04-x64
 * ```
 *
 * Digests are shortened to their first and last 4 hex digits.
 */
export function formatPlan(
  plan: Plan,
  options: { dryRun: boolean; local?: boolean }
): string {
  const sizeWidth =
    Math.max(plan.uut.size.length, plan.loadgen.size.length) + 2;
  const field = (label: string, values: string[]) =>
    values.map(
      (value, index) =>
        `  ${(index === 0 ? label : "").padEnd(LABEL_WIDTH)}${value}`
    );
  if (options.local) {
    return `${[
      options.dryRun
        ? `plan for ${plan.project} ${plan.targetVersion} (local dry run, nothing started)`
        : `plan for ${plan.project} ${plan.targetVersion} (local run ${plan.runId})`,
      ...field("hosts", [
        "this machine's Docker, for the server under test and the load generator"
      ]),
      ...field(
        "images",
        plan.images.map(
          (image) => `${image.name}:${image.tag}@${shortDigest(image.digest)}`
        )
      ),
      ...field("benchmarks", plan.benchmarks.map(describeBenchmark))
    ].join("\n")}\n`;
  }
  const header = options.dryRun
    ? `plan for ${plan.project} ${plan.targetVersion} (dry run, nothing created)`
    : `plan for ${plan.project} ${plan.targetVersion} (run ${plan.runId})`;
  const lines = [
    header,
    ...field("region", [
      `${plan.region}, new VPC (range assigned by DigitalOcean)`
    ]),
    ...field("uut", [`${plan.uut.size.padEnd(sizeWidth)}${plan.uut.image}`]),
    ...field("loadgen", [
      `${plan.loadgen.size.padEnd(sizeWidth)}${plan.loadgen.image}`
    ]),
    ...field("firewall", [
      `SIP (${SIP_PORTS} tcp/udp) and OTLP (${OTLP_PORT} tcp) from the VPC only; SSH (22) from ${plan.sshSource.replace(/\/32$/, "")} only`
    ]),
    ...field("tags", [plan.tags.join(", ")]),
    ...field(
      "images",
      plan.images.map(
        (image) => `${image.name}:${image.tag}@${shortDigest(image.digest)}`
      )
    ),
    ...field("benchmarks", plan.benchmarks.map(describeBenchmark)),
    ...field("deleted", [`at the end, or by sweep after ${plan.maxLifetime}`])
  ];
  return `${lines.join("\n")}\n`;
}

function shortDigest(digest: string): string {
  const [algorithm, hex = ""] = digest.split(":");
  return `${algorithm}:${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

function describeBenchmark(benchmark: BenchmarkConfig): string {
  if (benchmark.kind === "capacity") {
    const { start, step, every, max } = benchmark.load.rate;
    const steps = Math.floor((max - start) / step) + 1;
    const minutes = Math.ceil((steps * parseDuration(every)) / 60000);
    return `${benchmark.id} (capacity, up to ${minutes} min at ${number(start)} to ${number(max)} ${benchmark.load.unit}/s)`;
  }
  const total =
    parseDuration(benchmark.duration) + parseDuration(benchmark.warmup);
  return `${benchmark.id} (soak, ${span(total)})`;
}

function number(value: number): string {
  return value.toLocaleString("en-US");
}

/** `6 h 30 min`, `6 h`, `45 min`, `1 h 0 min 30 s`. */
function span(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [
    ...(h > 0 ? [`${h} h`] : []),
    ...(m > 0 || (h > 0 && s > 0) ? [`${m} min`] : []),
    ...(s > 0 ? [`${s} s`] : [])
  ];
  return parts.length > 0 ? parts.join(" ") : "0 s";
}
