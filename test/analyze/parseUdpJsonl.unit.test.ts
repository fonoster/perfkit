/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseUdpJsonl } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { START_MS, thrown } from "./builders.js";

describe("parseUdpJsonl", () => {
  describe("with valid input", () => {
    it("should add RcvbufErrors and SndbufErrors and leave InErrors out", () => {
      // Arrange
      const text = JSON.stringify({
        t: new Date(START_MS).toISOString(),
        host: "loadgen",
        RcvbufErrors: 3,
        SndbufErrors: 2,
        InErrors: 40
      });

      // Act
      const samples = parseUdpJsonl(text, "udp.jsonl");

      // Assert
      expect(samples).to.deep.equal([
        { tMs: START_MS, host: "loadgen", drops: 5 }
      ]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError for an unknown host", () => {
      // Arrange
      const text = JSON.stringify({
        t: new Date(START_MS).toISOString(),
        host: "elsewhere",
        RcvbufErrors: 0,
        SndbufErrors: 0,
        InErrors: 0
      });

      // Act
      const error = thrown(() => parseUdpJsonl(text, "udp.jsonl"));

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("udp.jsonl: [0].host");
    });
  });
});
