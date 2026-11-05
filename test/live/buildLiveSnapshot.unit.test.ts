/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildLiveSnapshot } from "../../src/live/buildLiveSnapshot.js";
import { LIVE_SCHEMA_ID, liveSchema } from "../../src/schemas/index.js";
import {
  CAPACITY,
  MIN,
  point,
  record,
  RUN_ID,
  runState,
  SOAK,
  STARTED_MS
} from "./state.js";

describe("buildLiveSnapshot", () => {
  it("should build a valid perfkit/live/v1 snapshot of a run in progress", () => {
    // Arrange
    const rec = record({
      [CAPACITY.id]: {
        startedMs: STARTED_MS + MIN,
        loadStartedMs: STARTED_MS + 2 * MIN,
        points: [point(50)]
      }
    });

    // Act
    const live = buildLiveSnapshot({
      state: runState(),
      record: rec,
      nowMs: STARTED_MS + 4 * MIN,
      soaks: new Map()
    });

    // Assert
    expect(liveSchema.safeParse(live).success).to.equal(true);
    expect(live).to.deep.include({
      schema: LIVE_SCHEMA_ID,
      runId: RUN_ID,
      version: "2.32.2",
      status: "running",
      reason: null,
      provider: "digitalocean",
      updatedAt: new Date(STARTED_MS + 4 * MIN).toISOString()
    });
    expect(live.project.name).to.equal("Routr");
    expect(live.benchmarks.map((b) => [b.id, b.state])).to.deep.equal([
      [CAPACITY.id, "running"],
      [SOAK.id, "queued"]
    ]);
    expect(live.estimatedEndAt).to.be.a("string");
    expect(live.benchmarks[1]?.estimatedStartAt).to.be.a("string");
  });

  it("should list a benchmark not selected as not-run, and have no end once finished", () => {
    const live = buildLiveSnapshot({
      state: runState({ selected: [SOAK.id], mode: "local" }),
      record: record({}, "finished"),
      nowMs: STARTED_MS,
      soaks: new Map()
    });
    expect(live.benchmarks[0]?.state).to.equal("not-run");
    expect(live.estimatedEndAt).to.equal(null);
    expect(live.provider).to.equal("local");
    expect(live.status).to.equal("finished");
  });

  it("should carry why a failed run stopped", () => {
    const live = buildLiveSnapshot({
      state: runState(),
      record: record({}, "failed"),
      nowMs: STARTED_MS,
      soaks: new Map()
    });
    expect(live.status).to.equal("failed");
    expect(live.reason).to.equal("the agent failed: boom");
  });
});
