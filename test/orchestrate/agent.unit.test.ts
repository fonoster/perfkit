/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
import {
  doSetup,
  MINIMAL,
  MINIMAL_CONFIG,
  PASSING_STEPS,
  type RawFiles
} from "./setup.js";

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

/**
 * A copy of the Routr example with one more benchmark, `one-capacity`: a
 * capacity ramp of calls to 200 registered callees.
 */
async function routrWithCapacityCallees(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "perfkit-routr-"));
  await cp(dirname(ROUTR_CONFIG), dir, { recursive: true });
  const rows = Array.from(
    { length: 200 },
    (_, i) => `callee${i};pass${i};[authentication username=callee${i} password=pass${i}]`
  );
  await writeFile(
    join(dir, "one-soak", "callees.csv"),
    ["SEQUENTIAL", ...rows, ""].join("\n")
  );
  const yaml = await readFile(ROUTR_CONFIG, "utf8");
  await writeFile(
    join(dir, "perfkit.yaml"),
    `${yaml}  - id: one-capacity
    kind: capacity
    title: RoutrOne
    narrative: { what: Calls between registered agents., why: A deployment saturates at its first component., how: SIPp ramps calls. }
    uut:
      compose: one-soak/compose.yaml
      processes:
        - { name: one, match: "dist/runner" }
    load:
      tool: sipp
      transport: udp
      register: { scenario: one-soak/uac_register.xml, users: one-soak/callees.csv, expires: 300 }
      uas: { scenario: one-soak/uas_answer.xml }
      uac: { scenario: edgeport-echo/uac_message.xml }
      rate: { start: 50, step: 50, every: 60s, max: 200 }
    thresholds: { p99LatencyMs: 150, failedCallsPct: 0.1 }
`
  );
  return join(dir, "perfkit.yaml");
}

/** A passing capacity ramp, and the register role's counts file. */
function capacityWithRegistrations(registered: number) {
  return {
    ...capacityRaw(PASSING_STEPS),
    "uac_register_8_counts.csv": [
      "CurrentTime;ElapsedTime;0_REGISTER_Sent;2_401_Recv;3_REGISTER_Sent;5_200_Recv;",
      `2026-11-03T14:12:10Z;00:00:10:000000;200;200;200;${registered};`,
      ""
    ].join("\n")
  };
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

  it("should leave a capacity warm-up out of the first step, live and in the final verdict", async () => {
    // Arrange: the first 30 of step 1's 100 messages (sent in its first 18 s)
    // are slow, as with a cold JIT; a 20 s warm-up leaves them out.
    const dir = await mkdtemp(join(tmpdir(), "perfkit-warmup-"));
    await cp(dirname(MINIMAL_CONFIG), dir, { recursive: true });
    const config = join(dir, "perfkit.yaml");
    const yaml = await readFile(config, "utf8");
    await writeFile(
      config,
      yaml.replace("kind: capacity\n", "kind: capacity\n    warmup: 20s\n")
    );
    const cold = [
      ...Array.from({ length: 30 }, () => 200),
      ...Array.from({ length: 70 }, () => 5)
    ];
    const steps = [
      { offeredCps: 50, latencies: cold },
      ...PASSING_STEPS.slice(1)
    ];
    const setup = await detached(
      ["run", "--config", config, "--target-version", "3.7.3"],
      capacityRaw(steps)
    );

    // Act
    await setup.agent.run(setup.runId());

    // Assert
    const progress = join(setup.hosts.roots.loadgen, "progress.log");
    expect((await readFile(progress, "utf8")).trim().split("\n")).to.deep.equal(
      [
        "[sipp-uas] step    50 messages/s  p99 5.0 ms  failed 0.00%  ok",
        "[sipp-uas] step   100 messages/s  p99 5.0 ms  failed 0.00%  ok",
        "[sipp-uas] step   150 messages/s  p99 5.0 ms  failed 0.00%  ok",
        "[sipp-uas] step   200 messages/s  p99 5.0 ms  failed 0.00%  ok"
      ]
    );
    const raw = join(setup.hosts.roots.loadgen, "raw", "sipp-uas");
    const meta = JSON.parse(await readFile(join(raw, "meta.json"), "utf8"));
    expect(meta.steps[0].from).to.equal(
      new Date(START_MS + 20_000).toISOString()
    );
    expect(meta.steps[1].from).to.equal(
      new Date(START_MS + 60_000).toISOString()
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
    expect(result).to.include({ verdict: "passed" });
    expect("series" in result && result.series?.steps[0]).to.include({
      p99Ms: 5,
      achievedCps: 50,
      valid: true
    });
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

  it("should start the capacity uac only after every callee has registered", async () => {
    // Arrange
    const config = await routrWithCapacityCallees();
    const setup = await detached(
      [
        "run",
        "--config",
        config,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "one-capacity"
      ],
      capacityWithRegistrations(200),
      true
    );

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup).map(({ command }) => command);
    const register = commands.findIndex((c) => c.includes("-sipp-register "));
    const uac = commands.findIndex((c) => c.includes("-sipp-uac "));
    expect(register).to.be.greaterThan(-1);
    expect(uac).to.be.greaterThan(register);
    expect(commands[uac]).to.include("-recv_timeout 10000");
    expect(commands[register]).not.to.include("-recv_timeout");
    const root = setup.hosts.roots.loadgen;
    expect(await readFile(join(root, "progress.log"), "utf8")).to.include(
      "[one-capacity] 200 callees registered"
    );
    const meta = JSON.parse(
      await readFile(join(root, "raw", "one-capacity", "meta.json"), "utf8")
    );
    expect(meta).to.include({ kind: "capacity", registerUsers: 200 });
  });

  it("should abort a capacity benchmark without starting its uac when the callees don't all register in time", async () => {
    // Arrange
    const config = await routrWithCapacityCallees();
    const setup = await detached(
      [
        "run",
        "--config",
        config,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "one-capacity"
      ],
      capacityWithRegistrations(150),
      true
    );

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup).map(({ command }) => command);
    expect(
      commands.some((c) => c.includes("-sipp-uac ") && c.includes("run -d"))
    ).to.equal(false);
    const raw = join(setup.hosts.roots.loadgen, "raw", "one-capacity");
    const reason =
      "only 150 of 200 callees registered within 70 s, so no call was placed";
    expect((await readFile(join(raw, "aborted"), "utf8")).trim()).to.equal(
      reason
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
