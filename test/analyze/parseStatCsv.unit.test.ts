/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseStatCsv } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { readFixtureDir, thrown } from "./builders.js";

describe("parseStatCsv", () => {
  describe("with valid input", () => {
    it("should read the recorded SIPp 3.7 stat file", () => {
      // Arrange
      const text = readFixtureDir("sipp-edgeport-echo")[
        "uac_invite_echo_1_.csv"
      ] as string;

      // Act
      const stat = parseStatCsv(text, "uac_invite_echo_1_.csv");

      // Assert
      expect(stat.startMs).to.equal(1793736284960.6);
      expect(stat.rows).to.have.length(21);
      expect(stat.rows[1]).to.include({
        tMs: 1793736294974.35,
        periodStartMs: 1793736284974.181
      });
      expect(stat.rows[1]?.counters).to.include({
        "OutgoingCall(P)": 500,
        "FailedCall(P)": 0,
        "SuccessfulCall(P)": 449,
        "Retransmissions(P)": 0,
        CurrentCall: 51,
        TargetRate: 50
      });
      expect(stat.rows[1]?.counters).not.to.have.property("ElapsedTime(P)");
      expect(stat.rows[0]?.periodStartMs).to.equal(stat.rows[0]?.tMs);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError when a required counter is missing", () => {
      // Arrange
      const text =
        "StartTime;CurrentTime;OutgoingCall(P)\n" +
        "2026-11-03\t20:04:44.9\t1793736284.9;2026-11-03\t20:04:54.9\t1793736294.9;5\n";

      // Act
      const error = thrown(() => parseStatCsv(text, "uac_1_.csv"));

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include('[0]["FailedCall(P)"]: required');
    });

    it("should throw ValidationError for a file with only a header", () => {
      // Act
      const error = thrown(() =>
        parseStatCsv("StartTime;CurrentTime\n", "x.csv")
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
    });
  });
});
