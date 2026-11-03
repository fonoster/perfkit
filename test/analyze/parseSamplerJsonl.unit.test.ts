/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parseSamplerJsonl } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { samplerLines, START_MS, thrown } from "./builders.js";

describe("parseSamplerJsonl", () => {
  describe("with valid input", () => {
    it("should sum RSS, CPU and fds of three processes matching one name", () => {
      // Arrange
      const text = [
        ...samplerLines(START_MS, [
          {
            host: "uut",
            name: "postgres",
            pid: 70,
            rssKB: 1000,
            cpuTicks: 10,
            fds: 5
          },
          {
            host: "uut",
            name: "postgres",
            pid: 52,
            rssKB: 2000,
            cpuTicks: 20,
            fds: 6
          },
          {
            host: "uut",
            name: "postgres",
            pid: 61,
            rssKB: 3000,
            cpuTicks: 30,
            fds: 7
          },
          { host: "loadgen", name: "postgres", pid: 9, rssKB: 1 }
        ])
      ].join("\n");

      // Act
      const samples = parseSamplerJsonl(text, "sampler.jsonl");

      // Assert
      expect(samples).to.have.length(2);
      expect(samples[0]).to.include({
        host: "uut",
        name: "postgres",
        pid: 52,
        rssKB: 6000,
        cpuTicks: 60,
        fds: 18,
        clkTck: 100,
        tMs: START_MS
      });
    });

    it("should return samples in time order and skip blank lines", () => {
      // Arrange
      const text = [
        ...samplerLines(START_MS + 10_000, [{ host: "uut", name: "one" }]),
        "",
        ...samplerLines(START_MS, [{ host: "uut", name: "one" }])
      ].join("\n");

      // Act
      const samples = parseSamplerJsonl(text, "sampler.jsonl");

      // Assert
      expect(samples.map((s) => s.tMs)).to.deep.equal([
        START_MS,
        START_MS + 10_000
      ]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError naming the line and field", () => {
      // Arrange
      const text = samplerLines(START_MS, [
        { host: "uut", name: "one" }
      ])[0]!.replace('"pid":41', '"pid":-1');

      // Act
      const error = thrown(() => parseSamplerJsonl(text, "sampler.jsonl"));

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("sampler.jsonl: [0].pid");
    });
  });
});
