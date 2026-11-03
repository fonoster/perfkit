/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  formatCount,
  formatDate,
  formatDuration,
  formatGrowth,
  formatRanAt,
  formatRate
} from "../../src/render/format.js";
import { summaryText } from "../../src/render/verdicts.js";

describe("render formats", () => {
  it("should write durations in hours and minutes", () => {
    expect(formatDuration(11520)).to.equal("3 h 12 min");
    expect(formatDuration(21600)).to.equal("6 h");
    expect(formatDuration(1560)).to.equal("26 min");
    expect(formatDuration(45)).to.equal("45 s");
  });

  it("should write dates and times in UTC", () => {
    expect(formatRanAt("2026-11-03T14:12:10Z")).to.equal(
      "Nov 3, 2026 · 14:12 UTC"
    );
    expect(formatDate("2026-10-19T23:59:59Z")).to.equal("Oct 19, 2026");
  });

  it("should write rates in the unit, growth with a sign and counts short", () => {
    expect(formatRate(1240, "messages")).to.equal("1,240 messages/s");
    expect(formatGrowth(0.3)).to.equal("+0.3 MB/h");
    expect(formatGrowth(-0.1)).to.equal("-0.1 MB/h");
    expect(formatCount(2160000)).to.equal("2.2M");
  });

  it("should count verdicts in words, singular for one benchmark", () => {
    const summary = {
      total: 2,
      passed: 1,
      failed: 0,
      inconclusive: 0,
      aborted: 0,
      notRun: 1
    };
    expect(summaryText(summary)).to.equal(
      "1 of 2 benchmarks passed · 1 not run"
    );
    expect(summaryText({ ...summary, total: 1, notRun: 0 })).to.equal(
      "1 of 1 benchmark passed"
    );
    expect(summaryText(summary, true)).to.equal("1 of 2 passed · 1 not run");
  });
});
