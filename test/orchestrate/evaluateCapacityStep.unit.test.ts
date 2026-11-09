/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { evaluateCapacityStep } from "../../src/orchestrate/evaluateCapacityStep.js";
import type { AgentFs } from "../../src/orchestrate/types.js";
import {
  capacityConfig,
  capacityRaw,
  RAW_DIR,
  samplerLines,
  START_MS,
  udpLine
} from "../analyze/builders.js";

/** The raw directory as the agent sees it mid-run: one sampler file per load generator. */
function liveRaw(extra: Record<string, string>): Record<string, string> {
  const files = capacityRaw([{ offeredCps: 50 }]);
  const named: Record<string, string> = {
    ...files,
    "sampler-loadgen.jsonl": files["sampler.jsonl"] as string,
    "udp-loadgen.jsonl": files["udp.jsonl"] as string,
    ...extra
  };
  delete named["sampler.jsonl"];
  delete named["udp.jsonl"];
  return named;
}

const fsOf = (files: Record<string, string>): AgentFs => ({
  readFile: async (path) => files[path.slice(RAW_DIR.length + 1)] as string,
  readdir: async () => Object.keys(files),
  writeFile: async () => {},
  appendFile: async () => {},
  mkdir: async () => {},
  rename: async () => {},
  exists: async () => true
});

const evaluate = (files: Record<string, string>) =>
  evaluateCapacityStep({
    fs: fsOf(files),
    rawDir: RAW_DIR,
    benchmark: capacityConfig({}, {}),
    index: 0,
    startMs: START_MS
  });

describe("evaluateCapacityStep", () => {
  it("should leave a step valid when the load generators are idle", async () => {
    // Act
    const evaluation = await evaluate(liveRaw({}));

    // Assert
    expect(evaluation.stop).to.equal(false);
    expect(evaluation.line).to.match(/ok$/);
  });

  it("should read another load generator's sampler file and call a saturated process invalid", async () => {
    // Arrange: sipp-uac (instance 1) is the only uac the config names, so the
    // saturated one here is the first callee process, on worker-1
    const busy = Array.from({ length: 7 }, (_, tick) =>
      samplerLines(START_MS + tick * 10_000, [
        { host: "worker-1", name: "sipp-register", cpuTicks: tick * 900 }
      ])
    )
      .flat()
      .join("\n");

    // Act
    const evaluation = await evaluate(
      liveRaw({ "sampler-worker-1.jsonl": `${busy}\n` })
    );

    // Assert
    expect(evaluation.stop).to.equal(true);
    expect(evaluation.line).to.include(
      "invalid, load generator saturated at 50 messages/s (sipp-register at 90% of one core)"
    );
  });

  it("should read another load generator's UDP counters", async () => {
    // Arrange
    const udp = [
      udpLine(START_MS + 10_000, "worker-1", 0),
      udpLine(START_MS + 40_000, "worker-1", 7)
    ].join("\n");

    // Act
    const evaluation = await evaluate(
      liveRaw({ "udp-worker-1.jsonl": `${udp}\n` })
    );

    // Assert
    expect(evaluation.stop).to.equal(true);
    expect(evaluation.line).to.include(
      "load generator dropped UDP packets at 50 messages/s (7 buffer errors)"
    );
  });
});
