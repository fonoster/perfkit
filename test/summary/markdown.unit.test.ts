/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  capitalized,
  cell,
  duration,
  growth,
  num,
  pct,
  table,
  verdictWord
} from "../../src/summary/markdown.js";

describe("summary markdown helpers", () => {
  it("should name each verdict in lowercase words", () => {
    // Act
    const words = (
      ["passed", "failed", "inconclusive", "aborted", "not-run"] as const
    ).map(verdictWord);

    // Assert
    expect(words).to.deep.equal([
      "passed",
      "failed",
      "inconclusive",
      "aborted",
      "not run"
    ]);
  });

  it("should capitalize the first letter only", () => {
    // Act / Assert
    expect(capitalized("not run")).to.equal("Not run");
    expect(capitalized("")).to.equal("");
  });

  it("should escape pipes and join lines in a cell", () => {
    // Act / Assert
    expect(cell("a | b\n  c")).to.equal("a \\| b c");
  });

  it("should write numbers, percentages, growth and durations", () => {
    // Act / Assert
    expect(num(1240.84)).to.equal("1,240.8");
    expect(num(2160000, 0)).to.equal("2,160,000");
    expect(pct(0.034)).to.equal("0.03%");
    expect(growth(7.44)).to.equal("+7.4 MB/h");
    expect(growth(-0.1)).to.equal("-0.1 MB/h");
    expect(duration(45)).to.equal("45 s");
    expect(duration(1560)).to.equal("26 min");
    expect(duration(21600)).to.equal("6 h");
    expect(duration(23400)).to.equal("6 h 30 min");
  });

  it("should write a table with right-aligned numeric columns", () => {
    // Act
    const text = table(
      ["Name", "Value"],
      [
        ["a", "1"],
        ["b", "2"]
      ],
      [false, true]
    );

    // Assert
    expect(text).to.equal(
      ["| Name | Value |", "| :--- | ---: |", "| a | 1 |", "| b | 2 |"].join(
        "\n"
      )
    );
  });
});
