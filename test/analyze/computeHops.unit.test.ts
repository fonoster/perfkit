/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeHops, parseOtlpSpans } from "../../src/analyze/index.js";
import { FIXTURES, START_MS } from "./builders.js";

const spansOf = (name: string) =>
  parseOtlpSpans(readFileSync(join(FIXTURES, "spans", name), "utf8"), name);

describe("computeHops", () => {
  it("should report self time, so a parent's time excludes its children", () => {
    // Act
    const hops = computeHops(
      spansOf("grpc-hops.jsonl"),
      0.01,
      START_MS + 1_800_000
    );

    // Assert
    expect(hops).to.deep.equal({
      sampleRatio: 0.01,
      spans: 9,
      services: [
        { service: "location", p50Ms: 3, p99Ms: 3 },
        { service: "processor", p50Ms: 16, p99Ms: 26 },
        { service: "routr-connect", p50Ms: 1, p99Ms: 1 }
      ]
    });
  });

  it("should count spans before sinceMs out", () => {
    // Act
    const hops = computeHops(spansOf("grpc-hops.jsonl"), 1, 0);

    // Assert
    expect(hops.spans).to.equal(12);
    expect(hops.services[1]).to.deep.equal({
      service: "processor",
      p50Ms: 16,
      p99Ms: 496
    });
  });

  it("should give the real export's parents a self time of 0", () => {
    // Act
    const hops = computeHops(spansOf("otelcol-telemetrygen.jsonl"), 1, 0);

    // Assert
    expect(hops.services).to.deep.equal([
      { service: "routr-test", p50Ms: 0.123, p99Ms: 0.123 }
    ]);
    expect(hops.spans).to.equal(9);
  });
});
