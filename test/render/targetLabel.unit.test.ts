/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { targetLabel } from "../../src/render/targetLabel.js";
import type { BenchmarkResult, Report } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";

describe("targetLabel", () => {
  const report = loadReport("passed") as Report;
  const benchmark = report.benchmarks[0] as BenchmarkResult;
  const infra = report.run.infra;

  it("should label a server benchmark Single server and a cluster one with its nodes", () => {
    expect(targetLabel({ ...benchmark, target: "server" }, infra)).to.equal(
      "Single server"
    );
    expect(
      targetLabel(
        { ...benchmark, target: "cluster" },
        {
          ...infra,
          cluster: {
            provider: "digitalocean",
            nodes: 3,
            size: "c-8",
            version: "1.33.1-do.0"
          }
        }
      )
    ).to.equal("Kubernetes, 3 × c-8");
    expect(
      targetLabel(
        { ...benchmark, target: "cluster" },
        {
          ...infra,
          cluster: {
            provider: "kind",
            nodes: 1,
            size: "local",
            version: "v1.33.1"
          }
        }
      )
    ).to.equal("Kubernetes (kind), 1 node");
  });

  it("should give no label for a report without targets", () => {
    const { target: _unused, ...old } = { ...benchmark, target: undefined };
    expect(targetLabel(old as BenchmarkResult, infra)).to.equal(null);
  });
});
