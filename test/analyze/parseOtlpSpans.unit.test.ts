/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOtlpSpans } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { FIXTURES, thrown } from "./builders.js";

const spansFixture = (name: string) =>
  readFileSync(join(FIXTURES, "spans", name), "utf8");

describe("parseOtlpSpans", () => {
  describe("with valid input", () => {
    it("should read a real OpenTelemetry Collector file export", () => {
      // Act
      const spans = parseOtlpSpans(
        spansFixture("otelcol-telemetrygen.jsonl"),
        "spans.jsonl"
      );

      // Assert
      expect(spans).to.have.length(9);
      expect(spans.every((span) => span.service === "routr-test")).to.equal(
        true
      );
      expect(spans[2]).to.deep.equal({
        traceId: "1bf73689d40c29970126fc47cf8abaa8",
        spanId: "76a7607eca749bb6",
        parentSpanId: null,
        service: "routr-test",
        startMs: 1793736921813.6396,
        durationMs: 0.246
      });
      expect(spans[0]).to.include({
        parentSpanId: "76a7607eca749bb6",
        durationMs: 0.123
      });
    });

    it("should name gRPC server spans by rpc.service and others by service.name", () => {
      // Act
      const spans = parseOtlpSpans(
        spansFixture("grpc-hops.jsonl"),
        "spans.jsonl"
      );

      // Assert
      expect(spans.slice(0, 2).map((span) => span.service)).to.deep.equal([
        "processor",
        "routr-connect"
      ]);
      expect(spans.at(-1)?.service).to.equal("location");
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError for a span without times", () => {
      // Arrange
      const text = JSON.stringify({
        resourceSpans: [
          { scopeSpans: [{ spans: [{ traceId: "a", spanId: "b" }] }] }
        ]
      });

      // Act
      const error = thrown(() => parseOtlpSpans(text, "spans.jsonl"));

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.include("startTimeUnixNano");
    });
  });
});
