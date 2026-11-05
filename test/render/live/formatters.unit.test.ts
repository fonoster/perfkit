/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { formatClock } from "../../../src/render/live/formatClock.js";
import { formatUpdated } from "../../../src/render/live/formatUpdated.js";
import { livePhase } from "../../../src/render/live/livePhase.js";
import { sampleLive } from "../../live/sample.js";

const AT = "2026-11-06T14:00:00Z";
const ms = Date.parse(AT);

describe("formatUpdated", () => {
  it("should say how old the snapshot is", () => {
    expect(formatUpdated(AT, ms + 8_000, "ok")).to.deep.equal({
      text: "updated 8 s ago",
      tone: "ok"
    });
  });

  it("should turn warning-coloured after a minute", () => {
    expect(formatUpdated(AT, ms + 61_000, "ok")).to.deep.equal({
      text: "updated 1 min ago",
      tone: "stale"
    });
  });

  it("should say the connection is lost after 3 minutes or a failed poll", () => {
    const lost = { text: "connection lost, retrying", tone: "lost" };
    expect(formatUpdated(AT, ms + 180_000, "ok")).to.deep.equal(lost);
    expect(formatUpdated(AT, ms + 1_000, "lost")).to.deep.equal(lost);
  });
});

describe("formatClock", () => {
  it("should write hours and minutes", () => {
    expect(formatClock(52 * 60 + 30)).to.equal("0:52");
    expect(formatClock(12 * 3600 + 5 * 60)).to.equal("12:05");
    expect(formatClock(-5)).to.equal("0:00");
  });
});

describe("livePhase", () => {
  it("should map the status to running, publishing or stopped", () => {
    const live = sampleLive();
    expect(livePhase(live)).to.equal("running");
    expect(livePhase({ ...live, status: "finished" })).to.equal("publishing");
    expect(livePhase({ ...live, status: "failed" })).to.equal("stopped");
  });
});
