/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportSchema } from "../../src/schemas/index.js";
import { capacityRaw } from "../analyze/builders.js";
import { fakeRegistry, infraDeps, perfkit } from "../infra/fakes.js";
import { fakePackage, FakeHosts } from "./harness.js";
import {
  agentRunner,
  MINIMAL,
  PASSING_STEPS,
  SIPP_DIGEST,
  sippWriter
} from "./setup.js";

async function localSetup() {
  const home = await mkdtemp(join(tmpdir(), "perfkit-home-"));
  const hosts = await FakeHosts.create({ local: home });
  hosts.onDocker = sippWriter(hosts, capacityRaw(PASSING_STEPS));
  hosts.onAgentStart = async (_host, command) => {
    const runId = / agent --run (\S+)/.exec(command)?.[1] as string;
    const root = join(home, ".perfkit", "runs", runId, "root");
    await agentRunner(hosts, root).run(runId);
  };
  const out = await mkdtemp(join(tmpdir(), "perfkit-out-"));
  const infra = infraDeps({
    home,
    registry: fakeRegistry({ "pumpagubben/sipp:3.7.3": SIPP_DIGEST }),
    packageRoot: await fakePackage("9.8.7"),
    executeBenchmarks: undefined,
    runProgram: async (_file, args) =>
      hosts.exec("loadgen", args[1] as string, "cli")
  });
  return { home, hosts, infra, out };
}

describe("perfkit run --local", () => {
  it("should run on the local Docker, never call the DigitalOcean client, and write a valid local report", async () => {
    // Arrange
    const { infra, out, hosts } = await localSetup();

    // Act
    const result = await perfkit([...MINIMAL, "--local", "--out", out], infra);

    // Assert
    expect(result.err).to.equal("");
    expect(result.code).to.equal(0);
    expect(infra.clients).to.deep.equal([]);
    expect(infra.account.calls).to.deep.equal([]);
    const runId = /local run (\S+)\)/.exec(result.out)?.[1] as string;
    const report = reportSchema.parse(
      JSON.parse(await readFile(join(out, runId, "report.json"), "utf8"))
    );
    expect(report.run.infra).to.deep.include({
      provider: "local",
      region: "local"
    });
    expect(report.run.infra.uut).to.deep.equal({
      size: "local",
      vcpus: 8,
      memoryMB: 16384
    });
    const up = hosts.commands.find(({ command }) =>
      command.endsWith(" up -d")
    )!.command;
    expect(up).to.include(
      "PERFKIT_UUT_IP=127.0.0.1 PERFKIT_LOADGEN_IP=127.0.0.1 PERFKIT_VPC_CIDR=127.0.0.0/8"
    );
    expect(
      hosts.commands.some(({ command }) => command.includes("ssh "))
    ).to.equal(false);
    expect(result.out).to.include("removed the run's containers\n");
  });

  it("should print the local plan and touch nothing with --dry-run", async () => {
    // Arrange
    const { infra, out, hosts } = await localSetup();

    // Act
    const result = await perfkit(
      [...MINIMAL, "--local", "--dry-run", "--out", out],
      infra
    );

    // Assert
    expect(result.code).to.equal(0);
    expect(result.out).to.match(
      /^plan for Minimal 3\.7\.3 \(local dry run, nothing started\)\n/
    );
    expect(hosts.commands).to.deep.equal([]);
    expect(infra.clients).to.deep.equal([]);
  });

  it("should serve the run's live.json from this machine while it follows the run, then close it", async () => {
    // Arrange
    const { infra, out } = await localSetup();
    const served: Array<{ root: string; live: unknown; siteUrl: string }> = [];
    let closed = 0;
    infra.serveLive = async (input) => {
      served.push(input);
      return {
        close: async () => {
          closed += 1;
        }
      };
    };

    // Act
    const result = await perfkit(
      [...MINIMAL, "--local", "--out", out, "--live-port", "8799"],
      infra
    );

    // Assert
    expect(result.code).to.equal(0);
    expect(served).to.have.length(1);
    expect(served[0]?.live).to.deep.equal({ port: 8799, domain: null });
    expect(served[0]?.siteUrl).to.equal(
      "https://fonoster.github.io/perfkit/benchmarks"
    );
    expect(served[0]?.root).to.match(/\.perfkit\/runs\/[^/]+\/root$/);
    expect(closed).to.equal(1);
  });
});
