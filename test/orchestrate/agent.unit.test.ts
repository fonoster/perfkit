/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../../src/errors/index.js";
import { createNodeAnalyzeDeps } from "../../src/analyze/index.js";
import { analyzeBenchmark } from "../../src/orchestrate/analyzeBenchmark.js";
import { createAgent } from "../../src/orchestrate/createAgent.js";
import { runStateSchema } from "../../src/orchestrate/runState.schema.js";
import {
  capacityRaw,
  latenciesWithP99,
  soakRaw,
  START_MS
} from "../analyze/builders.js";
import { ROUTR_CONFIG } from "../fixtures.js";
import { fakeRegistry, perfkit } from "../infra/fakes.js";
import { doSetup, MINIMAL, PASSING_STEPS, type RawFiles } from "./setup.js";

/** A detached run whose agent the test runs itself. */
async function detached(args: string[], files: RawFiles, routr = false) {
  const setup = await doSetup({ agentOnStart: false, files });
  if (routr) setup.infra.registry = fakeRegistry();
  const result = await perfkit(
    [...args, "--detach", "--out", setup.out],
    setup.infra
  );
  expect(result.err).to.equal("");
  return setup;
}

const ROUTR = ["run", "--config", ROUTR_CONFIG, "--target-version", "2.31.5"];
/** Gives the uploaded one-soak project 200 callees (the example's file is empty). */
async function withCallees(setup: Awaited<ReturnType<typeof doSetup>>) {
  const rows = Array.from(
    { length: 200 },
    (_, i) =>
      `callee${i};pass${i};[authentication username=callee${i} password=pass${i}]`
  );
  await writeFile(
    join(setup.hosts.roots.loadgen, "project", "one-soak", "callees.csv"),
    ["SEQUENTIAL", ...rows, ""].join("\n")
  );
}

const agentCommands = (setup: Awaited<ReturnType<typeof doSetup>>) =>
  setup.hosts.commands.filter(({ by }) => by === "agent");

describe("createAgent", () => {
  it("should stop SIPp right after the first step that breaks a rule and start no next step", async () => {
    // Arrange
    const steps = [
      { offeredCps: 50 },
      { offeredCps: 100, latencies: latenciesWithP99(80) },
      { offeredCps: 150 },
      { offeredCps: 200 }
    ];
    const setup = await detached(MINIMAL, capacityRaw(steps));
    const progress = join(setup.hosts.roots.loadgen, "progress.log");

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const lines = (await readFile(progress, "utf8")).trim().split("\n");
    expect(lines).to.deep.equal([
      "[sipp-uas] step    50 messages/s  p99 5.0 ms  failed 0.00%  ok",
      "[sipp-uas] step   100 messages/s  p99 80.0 ms  failed 0.00%  over the p99 limit; stopping"
    ]);
    const raw = join(setup.hosts.roots.loadgen, "raw", "sipp-uas");
    const meta = JSON.parse(await readFile(join(raw, "meta.json"), "utf8"));
    expect(
      meta.steps.map(({ offeredCps }: { offeredCps: number }) => offeredCps)
    ).to.deep.equal([50, 100]);
    expect(meta.startedAt).to.equal(new Date(START_MS).toISOString());
    const stop = agentCommands(setup).findIndex(
      ({ command }) =>
        command.includes("docker kill -s USR1") && command.includes("-sipp-uac")
    );
    expect(stop).to.be.greaterThan(-1);
    // SIPp is stopped at the second step's evaluation: 2 min 11 s after it started.
    expect(setup.agent.clock.now - START_MS).to.be.lessThan(
      2 * 60 * 1000 + 12 * 1000
    );
  });

  it("should run compose down for the first benchmark before compose up for the second, and the second's setup once", async () => {
    // Arrange
    const setup = await detached(
      ROUTR,
      (id) =>
        id === "one-soak"
          ? soakRaw({ warmupS: 1800, afterS: 21600 })
          : capacityRaw(PASSING_STEPS),
      true
    );

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup).map(({ command }) => command);
    const project = (id: string) =>
      `-p pk-${setup.runId().toLowerCase()}-${id} `;
    const down = commands.findIndex(
      (c) => c.includes(project("edgeport-echo")) && c.includes(" down ")
    );
    const up = commands.findIndex(
      (c) => c.includes(project("one-soak")) && c.endsWith(" up -d")
    );
    expect(down).to.be.greaterThan(-1);
    expect(up).to.be.greaterThan(down);
    expect(
      commands.filter((c) => c.includes("node one-soak/seed.js"))
    ).to.have.length(1);
    expect(commands.filter((c) => c.includes(" up -d"))).to.have.length(2);
  });

  it("should abort a soak with the Contract's reason after 3 failed checks of the UUT, keeping what was collected", async () => {
    // Arrange
    const setup = await detached(
      [
        "run",
        "--config",
        ROUTR_CONFIG,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "one-soak"
      ],
      soakRaw({ warmupS: 1800, afterS: 21600 }),
      true
    );
    const shell = setup.hosts.agentShell;
    let checks = 0;
    setup.hosts.agentShell = async (host, command, options) => {
      if (host === "uut" && command === "true") {
        checks += 1;
        if (checks > 10) setup.hosts.down.add("uut");
      }
      return shell(host, command, options);
    };

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    expect(checks).to.equal(13);
    const raw = join(setup.hosts.roots.loadgen, "raw", "one-soak");
    expect((await readFile(join(raw, "aborted"), "utf8")).trim()).to.equal(
      "the server under test stopped responding"
    );
    const state = runStateSchema.parse(
      JSON.parse(
        await readFile(join(setup.hosts.roots.loadgen, "run.json"), "utf8")
      )
    );
    const result = await analyzeBenchmark(
      createNodeAnalyzeDeps(),
      state.plan.benchmarks[0]!,
      raw,
      null,
      "SIPp 3.7.3, UDP"
    );
    expect(result).to.include({
      verdict: "aborted",
      reason: "the server under test stopped responding"
    });
    expect(
      "resources" in result && result.resources?.processes.length
    ).to.equal(3);
  });

  it("should start the soak uac only after every callee has registered", async () => {
    // Arrange
    const setup = await detached(
      [...ROUTR, "--benchmarks", "one-soak"],
      soakRaw({ warmupS: 1800, afterS: 21600 }),
      true
    );
    await withCallees(setup);

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup).map(({ command }) => command);
    const register = commands.findIndex((c) => c.includes("-sipp-register "));
    const uac = commands.findIndex((c) => c.includes("-sipp-uac "));
    expect(register).to.be.greaterThan(-1);
    expect(uac).to.be.greaterThan(register);
    const progress = await readFile(
      join(setup.hosts.roots.loadgen, "progress.log"),
      "utf8"
    );
    expect(progress).to.include("[one-soak] 200 callees registered");
  });

  it("should abort a soak without starting its uac when the callees don't all register in time", async () => {
    // Arrange
    const setup = await detached(
      [...ROUTR, "--benchmarks", "one-soak"],
      soakRaw({ warmupS: 1800, afterS: 21600, registered: 150 }),
      true
    );
    await withCallees(setup);

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup).map(({ command }) => command);
    expect(
      commands.some((c) => c.includes("-sipp-uac ") && c.includes("run -d"))
    ).to.equal(false);
    const raw = join(setup.hosts.roots.loadgen, "raw", "one-soak");
    const reason =
      "only 150 of 200 callees registered within 70 s, so no call was placed";
    expect((await readFile(join(raw, "aborted"), "utf8")).trim()).to.equal(
      reason
    );
    expect(await readFile(join(raw, "done"), "utf8")).to.match(/^\d{4}-/);
    const state = runStateSchema.parse(
      JSON.parse(
        await readFile(join(setup.hosts.roots.loadgen, "run.json"), "utf8")
      )
    );
    const result = await analyzeBenchmark(
      createNodeAnalyzeDeps(),
      state.plan.benchmarks[0]!,
      raw,
      null,
      "SIPp 3.7.3, UDP"
    );
    expect(result).to.include({ verdict: "aborted", reason });
  });

  it("should fail the run when the setup script exits non-zero", async () => {
    // Arrange
    const setup = await detached(
      [
        "run",
        "--config",
        ROUTR_CONFIG,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "one-soak"
      ],
      soakRaw({ warmupS: 1800, afterS: 21600 }),
      true
    );
    setup.hosts.onDocker = async (_host, command) =>
      command.includes("node one-soak/seed.js")
        ? { code: 1, stdout: "", stderr: "seed: connection refused\n" }
        : undefined;

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({
      status: "failed",
      message:
        "the setup script one-soak/seed.js exited 1: seed: connection refused"
    });
    expect(
      await readFile(join(setup.hosts.roots.loadgen, "failed"), "utf8")
    ).to.include("seed.js exited 1");
  });

  it("should throw ValidationError for a relative root and read nothing", async () => {
    // Arrange
    const setup = await detached(MINIMAL, capacityRaw(PASSING_STEPS));
    const fs = setup.hosts.agentFs();
    let reads = 0;
    const agent = createAgent({
      shell: setup.hosts.agentShell,
      fs: {
        ...fs,
        readFile: async (path) => {
          reads += 1;
          return fs.readFile(path);
        }
      },
      now: () => START_MS,
      sleep: async () => {},
      log: async () => {}
    });

    // Act
    const error = await agent({
      root: "opt/perfkit",
      runId: setup.runId()
    }).catch((err: unknown) => err);

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
    expect(reads).to.equal(0);
  });
});
