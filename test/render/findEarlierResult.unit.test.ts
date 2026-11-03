/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { niceScale } from "../../src/render/charts/niceScale.js";
import { findEarlierResult } from "../../src/render/findEarlierResult.js";
import { runsSchema } from "../../src/schemas/index.js";
import { loadHistory, RUNS_4 } from "./site.js";

describe("findEarlierResult", () => {
  const { runs } = runsSchema.parse(loadHistory(RUNS_4));
  const newest = runs[0]!;
  const memory = (b: (typeof newest.benchmarks)[number]) =>
    b.kind === "soak" && b.headline ? b.headline.memoryGrowthMBPerHour : null;

  it("should skip earlier runs without the value", () => {
    // Act
    const found = findEarlierResult(runs, newest, "one-soak", memory);

    // Assert
    expect(found?.run.version).to.equal("2.31.3");
    expect(found?.value).to.equal(7.4);
  });

  it("should return null when no earlier run has it", () => {
    // Act
    const found = findEarlierResult(runs, runs[3]!, "one-soak", memory);

    // Assert
    expect(found).to.equal(null);
  });
});

describe("niceScale", () => {
  it("should round the axis up to a nice step", () => {
    expect(niceScale(62)).to.deep.equal({
      max: 80,
      ticks: [0, 20, 40, 60, 80]
    });
    expect(niceScale(1300).max).to.equal(2000);
  });
});
