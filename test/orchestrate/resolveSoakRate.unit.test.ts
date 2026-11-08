/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { resolveSoakRate } from "../../src/orchestrate/resolveSoakRate.js";
import { soakBenchmarkConfigSchema } from "../../src/schemas/index.js";
import { soakConfig } from "../analyze/builders.js";

const fromCapacity = soakBenchmarkConfigSchema.parse({
  ...soakConfig(),
  id: "k8s-soak",
  load: {
    ...soakConfig().load,
    rate: { fromCapacity: "k8s-capacity", fraction: 0.5, fallbackCps: 50 }
  }
});

describe("resolveSoakRate", () => {
  it("should run at fraction × the limit, rounded down", () => {
    expect(
      resolveSoakRate(
        fromCapacity,
        new Map([["k8s-capacity", { cps: 3001, lowerBound: false }]])
      )
    ).to.deep.equal({
      cps: 1500,
      rateSource: { fromCapacity: "k8s-capacity", limit: 3001, fraction: 0.5 },
      line: "[k8s-soak] rate 1,500 calls/s: 0.5 × the limit of k8s-capacity (3,001 calls/s)"
    });
  });

  it("should run at fraction × a lower-bound limit and say so", () => {
    expect(
      resolveSoakRate(
        fromCapacity,
        new Map([["k8s-capacity", { cps: 300, lowerBound: true }]])
      )
    ).to.deep.equal({
      cps: 150,
      rateSource: {
        fromCapacity: "k8s-capacity",
        limit: 300,
        fraction: 0.5,
        lowerBound: true
      },
      line: "[k8s-soak] rate 150 calls/s: 0.5 × the lower-bound limit of k8s-capacity (at least 300 calls/s)"
    });
  });

  it("should fall back when the capacity benchmark found no limit or did not run", () => {
    const none = resolveSoakRate(
      fromCapacity,
      new Map([["k8s-capacity", null]])
    );
    const notRun = resolveSoakRate(fromCapacity, new Map());
    expect(none).to.deep.include({
      cps: 50,
      rateSource: { fromCapacity: "k8s-capacity", limit: null, fraction: 0.5 },
      line: "[k8s-soak] rate 50 calls/s (fallbackCps): k8s-capacity found no limit"
    });
    expect(notRun?.line).to.equal(
      "[k8s-soak] rate 50 calls/s (fallbackCps): k8s-capacity did not run"
    );
    expect(
      resolveSoakRate(
        fromCapacity,
        new Map([["k8s-capacity", { cps: 1, lowerBound: false }]])
      )?.cps
    ).to.equal(50);
  });

  it("should return null for a soak with a fixed cps", () => {
    expect(resolveSoakRate(soakConfig(), new Map())).to.equal(null);
  });
});
