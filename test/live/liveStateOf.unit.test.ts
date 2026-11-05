/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { liveStateOf } from "../../src/live/liveStateOf.js";

const rec = (startedMs: number | null, endedMs: number | null) => ({
  startedMs,
  loadStartedMs: null,
  endedMs,
  points: []
});

describe("liveStateOf", () => {
  it("should tell not-run, queued, running and done apart", () => {
    expect(liveStateOf(false, undefined)).to.equal("not-run");
    expect(liveStateOf(true, undefined)).to.equal("queued");
    expect(liveStateOf(true, rec(1, null))).to.equal("running");
    expect(liveStateOf(true, rec(1, 2))).to.equal("done");
  });
});
