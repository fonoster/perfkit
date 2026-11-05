/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { liveSchema } from "../../src/schemas/index.js";
import { sampleLive } from "../live/sample.js";
import { errorsOf } from "./check.js";

describe("liveSchema", () => {
  it("should accept a snapshot the agent builds", () => {
    expect(errorsOf(liveSchema, sampleLive())).to.deep.equal([]);
  });

  it("should reject another schema id, a bad status and unknown fields", () => {
    const live = sampleLive() as unknown as Record<string, unknown>;
    expect(errorsOf(liveSchema, { ...live, schema: "perfkit/live/v2" })[0]).to.match(/^schema: /);
    expect(errorsOf(liveSchema, { ...live, status: "paused" })[0]).to.match(/^status: /);
    expect(errorsOf(liveSchema, { ...live, extra: 1 })).to.have.length(1);
  });

  it("should reject more than 300 memory samples per process", () => {
    const live = sampleLive();
    const soak = live.benchmarks[1];
    if (soak?.kind !== "soak") throw new Error("expected the soak");
    const sample = soak.memory[0]!.samples[0]!;
    soak.memory[0]!.samples = Array.from({ length: 301 }, () => sample);
    expect(errorsOf(liveSchema, live)[0]).to.match(/samples: expected at most 300 samples/);
  });
});
