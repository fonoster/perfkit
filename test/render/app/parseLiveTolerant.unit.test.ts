/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseLiveTolerant } from "../../../src/render/app/parseLiveTolerant.js";
import { sampleLive } from "../../live/sample.js";

interface Snapshot {
  [key: string]: unknown;
  benchmarks: Array<{
    kind: string;
    thresholds: Record<string, unknown>;
    points: Array<Record<string, unknown>>;
  }>;
}

const plain = (value: unknown): Snapshot => JSON.parse(JSON.stringify(value));

describe("parseLiveTolerant", () => {
  it("should return a valid snapshot as it is", () => {
    // Act and assert
    expect(parseLiveTolerant(plain(sampleLive()))).to.deep.equal(sampleLive());
  });

  it("should leave out unknown fields at any depth, so a newer perfkit's snapshot still shows", () => {
    // Arrange: a new field at the top, in the thresholds and in a point
    const live = plain(sampleLive());
    live.loadgens = 2;
    const capacity = live.benchmarks.find(({ kind }) => kind === "capacity")!;
    capacity.thresholds.confirmMore = 3;
    capacity.points[0]!.extra = "x";

    // Act
    const parsed = parseLiveTolerant(live);

    // Assert
    expect(parsed).to.deep.equal(sampleLive());
  });

  it("should reject a snapshot with a wrong field, even when it has unknown ones too", () => {
    // Arrange
    const live = plain(sampleLive());
    live.loadgens = 2;
    live.status = "paused";

    // Act and assert
    expect(parseLiveTolerant(live)).to.equal(null);
    expect(parseLiveTolerant({})).to.equal(null);
    expect(parseLiveTolerant({ ...plain(sampleLive()), schema: "x" })).to.equal(
      null
    );
  });
});
