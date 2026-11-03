/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { EventEmitter } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sinon from "sinon";
import { createNodeAnalyzeDeps } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { createCollect } from "../../src/orchestrate/createCollect.js";
import { reportSchema } from "../../src/schemas/index.js";
import { capacityRaw } from "../analyze/builders.js";
import { ROUTR_CONFIG } from "../fixtures.js";
import { fakeClock, fakeRegistry, perfkit } from "../infra/fakes.js";
import { writeRaw } from "./harness.js";
import { doSetup, PASSING_STEPS } from "./setup.js";

/**
 * A detached Routr run whose capacity benchmark is done and whose soak is
 * still running, as the load generator holds it.
 */
async function halfDone() {
  const setup = await doSetup({ agentOnStart: false });
  setup.infra.registry = fakeRegistry();
  await perfkit(
    [
      "run",
      "--config",
      ROUTR_CONFIG,
      "--target-version",
      "2.31.5",
      "--detach",
      "--out",
      setup.out
    ],
    setup.infra
  );
  const root = setup.hosts.roots.loadgen;
  await writeRaw(join(root, "raw", "edgeport-echo"), {
    ...capacityRaw(PASSING_STEPS.map(({ offeredCps }) => ({ offeredCps }))),
    done: "x\n"
  });
  await writeFile(
    join(root, "status.json"),
    JSON.stringify({
      benchmarks: {
        "edgeport-echo": { state: "done" },
        "one-soak": {
          state: "running",
          startedAt: "2026-11-03T14:20:00Z",
          plannedS: 23400
        }
      },
      done: false,
      failed: null
    })
  );
  const signals = new EventEmitter();
  const clock = fakeClock();
  const teardown = sinon.stub().resolves({
    summary: "deleted 2 droplets, firewall, VPC, SSH key",
    failures: []
  });
  const out: string[] = [];
  const err: string[] = [];
  const collect = (sleep = clock.sleep) =>
    createCollect({
      remote: {
        exec: (host, command) => setup.hosts.exec(host, command, "cli"),
        upload: setup.hosts.upload,
        download: setup.hosts.download
      },
      root: "/opt/perfkit",
      teardown,
      analyzeDeps: createNodeAnalyzeDeps(),
      now: clock.now,
      sleep,
      signals,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text)
    });
  return {
    setup,
    signals,
    clock,
    teardown,
    out,
    err,
    collect,
    runId: setup.runId()
  };
}

async function reportOf(dir: string, runId: string) {
  return reportSchema.parse(
    JSON.parse(await readFile(join(dir, runId, "report.json"), "utf8"))
  );
}

describe("createCollect", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should report the capacity result, abort the soak as the load generator stopped responding, exit 1 and tear down after 3 failed reads", async () => {
    // Arrange
    const t = await halfDone();
    let reads = 0;
    const exec = t.setup.hosts.exec;
    t.setup.hosts.exec = async (host, command, by) => {
      reads += 1;
      if (reads > 1) t.setup.hosts.down.add("loadgen");
      return exec(host, command, by);
    };

    // Act
    const code = await t.collect()({
      runId: t.runId,
      out: t.setup.out,
      timeoutMs: null
    });

    // Assert
    expect(code).to.equal(1);
    const report = await reportOf(t.setup.out, t.runId);
    expect(
      report.benchmarks.map(({ id, verdict }) => [id, verdict])
    ).to.deep.equal([
      ["edgeport-echo", "passed"],
      ["one-soak", "aborted"]
    ]);
    expect(report.benchmarks[1]).to.include({
      reason: "the load generator stopped responding"
    });
    expect(t.clock.clock.slept).to.deep.equal([30_000, 30_000, 30_000]);
    expect(t.teardown.callCount).to.equal(1);
  });

  it("should report the capacity result, abort the soak as cancelled, tear down and exit 130 on SIGINT", async () => {
    // Arrange
    const t = await halfDone();
    const sleep = async (ms: number) => {
      t.clock.clock.now += ms;
      t.signals.emit("SIGINT");
    };

    // Act
    const code = await t.collect(sleep)({
      runId: t.runId,
      out: t.setup.out,
      timeoutMs: null
    });

    // Assert
    expect(code).to.equal(130);
    const report = await reportOf(t.setup.out, t.runId);
    expect(report.benchmarks[0]).to.include({ verdict: "passed" });
    expect(report.benchmarks[1]).to.include({
      verdict: "aborted",
      reason: "the run was cancelled"
    });
    expect(
      t.setup.hosts.commands.some(({ command }) =>
        /docker rm -f pk-\S+-agent/.test(command)
      )
    ).to.equal(true);
    expect(t.teardown.callCount).to.equal(1);
  });

  it("should exit 130 and delete nothing on SIGINT during --wait", async () => {
    // Arrange
    const t = await halfDone();
    const sleep = async () => {
      t.signals.emit("SIGINT");
    };

    const before = t.setup.hosts.commands.length;

    // Act
    const code = await t.collect(sleep)({
      runId: t.runId,
      wait: true,
      out: t.setup.out,
      timeoutMs: null
    });

    // Assert
    expect(code).to.equal(130);
    expect(t.teardown.callCount).to.equal(0);
    expect(
      t.setup.hosts.commands
        .slice(before)
        .some(({ command }) => command.includes("docker rm"))
    ).to.equal(false);
  });

  it("should exit 4 with the running benchmark's progress when the timeout passes", async () => {
    // Arrange
    const t = await halfDone();

    // Act
    const code = await t.collect()({
      runId: t.runId,
      out: t.setup.out,
      timeoutMs: 60_000
    });

    // Assert
    expect(code).to.equal(4);
    expect(t.out.at(-1)).to.equal("[one-soak] running, 0s of 6h30m\n");
    expect(t.teardown.callCount).to.equal(0);
  });

  it("should throw ValidationError for a bad run id and read nothing", async () => {
    // Arrange
    const t = await halfDone();
    const before = t.setup.hosts.commands.length;

    // Act
    const error = await t
      .collect()({ runId: "nope", out: t.setup.out, timeoutMs: null })
      .catch((e: unknown) => e);

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
    expect(t.setup.hosts.commands.length).to.equal(before);
  });
});
