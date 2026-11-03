/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../../src/errors/index.js";
import { buildReport } from "../../src/orchestrate/buildReport.js";
import { createStartRun } from "../../src/orchestrate/createStartRun.js";
import { runStateSchema } from "../../src/orchestrate/runState.schema.js";
import type { BenchmarkResult } from "../../src/schemas/index.js";
import { ROUTR_CONFIG } from "../fixtures.js";
import { fakeRegistry, perfkit } from "../infra/fakes.js";
import { doSetup } from "./setup.js";

describe("buildReport", () => {
  it("should list a benchmark not selected with --benchmarks as not-run", async () => {
    // Arrange
    const setup = await doSetup({ agentOnStart: false });
    setup.infra.registry = fakeRegistry();
    await perfkit(
      [
        "run",
        "--config",
        ROUTR_CONFIG,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "edgeport-echo",
        "--detach"
      ],
      setup.infra
    );
    const state = runStateSchema.parse(
      JSON.parse(
        await readFile(join(setup.hosts.roots.loadgen, "run.json"), "utf8")
      )
    );
    const capacity = state.config.benchmarks[0]!;
    const results = new Map<string, BenchmarkResult>([
      [
        "edgeport-echo",
        {
          id: capacity.id,
          kind: "capacity",
          title: capacity.title,
          narrative: capacity.narrative,
          unit: "messages",
          verdict: "aborted",
          reason: "the run was cancelled",
          durationS: 0,
          tool: "SIPp 3.7.3, UDP"
        }
      ]
    ]);

    // Act
    const report = buildReport(state, results, "2026-11-03T15:00:00Z");

    // Assert
    expect(report.benchmarks[1]).to.deep.include({
      id: "one-soak",
      verdict: "not-run",
      reason: "not selected for this run"
    });
    expect(report.verdict).to.deep.equal({
      total: 2,
      passed: 0,
      failed: 0,
      inconclusive: 0,
      aborted: 1,
      notRun: 1
    });
    expect(report.run.infra).to.deep.include({
      provider: "digitalocean",
      region: "nyc3"
    });
    expect(report.project.logoSvg).to.match(/^<svg/);
  });
});

describe("createStartRun", () => {
  it("should throw ValidationError for a relative root and run nothing", async () => {
    // Arrange
    let calls = 0;
    const startRun = createStartRun({
      remote: {
        exec: async () => {
          calls += 1;
          return { code: 0, stdout: "", stderr: "" };
        },
        upload: async () => {},
        download: async () => {}
      },
      packageRoot: "/nowhere"
    });

    // Act
    const error = await startRun({ root: "opt/perfkit" }).catch(
      (e: unknown) => e
    );

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
    expect(calls).to.equal(0);
  });
});
