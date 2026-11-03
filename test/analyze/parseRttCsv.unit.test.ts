/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseRttCsv } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { readFixtureDir, thrown } from "./builders.js";

describe("parseRttCsv", () => {
  describe("with valid input", () => {
    it("should read the recorded SIPp 3.7 rtt file, one row per call", () => {
      // Arrange
      const text = readFixtureDir("sipp-edgeport-echo")[
        "uac_invite_echo_1_rtt.csv"
      ] as string;

      // Act
      const rows = parseRttCsv(text, "uac_invite_echo_1_rtt.csv");

      // Assert
      expect(rows).to.have.length(17947);
      expect(rows[0]).to.deep.equal({
        atMs: 30.001,
        responseTimeMs: 6,
        rtd: 1
      });
      expect(rows.at(-1)).to.deep.equal({
        atMs: 180002,
        responseTimeMs: 0,
        rtd: 1
      });
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError for another header", () => {
      // Act
      const error = thrown(() =>
        parseRttCsv("date;dateMs;rtd_no;response_time;rtd_name\n", "a_rtt.csv")
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("a_rtt.csv: header");
    });

    it("should throw ValidationError for a row that is not numbers", () => {
      // Act
      const error = thrown(() =>
        parseRttCsv("Date_ms;response_time_ms;rtd_no\n12;abc;1\n", "a_rtt.csv")
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("rows[0].responseTimeMs");
    });
  });
});
