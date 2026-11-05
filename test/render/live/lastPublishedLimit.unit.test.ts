/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { lastPublishedLimit } from "../../../src/render/live/lastPublishedLimit.js";
import { HISTORY } from "./history.js";

describe("lastPublishedLimit", () => {
  it("should find the newest published limit of a benchmark", () => {
    expect(lastPublishedLimit(HISTORY, "edgeport-echo", "x")).to.deep.equal({
      limitCps: 1240,
      version: "2.31.5"
    });
  });

  it("should leave out the run in progress and know nothing of other benchmarks", () => {
    const newest = HISTORY[0]!.id;
    expect(
      lastPublishedLimit(HISTORY, "edgeport-echo", newest)?.version
    ).to.not.equal(undefined);
    expect(lastPublishedLimit(HISTORY, "nope", "x")).to.equal(null);
    expect(lastPublishedLimit([], "edgeport-echo", "x")).to.equal(null);
  });
});
