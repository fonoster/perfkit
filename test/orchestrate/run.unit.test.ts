/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sinon from "sinon";
import { reportSchema } from "../../src/schemas/index.js";
import { NODE_IMAGE, SIPP_IMAGE } from "../../src/tools.js";
import { EXAMPLES } from "../fixtures.js";
import { perfkit } from "../infra/fakes.js";
import { readTree } from "./harness.js";
import {
  AGENT_KEY,
  doSetup,
  MINIMAL,
  SHARED_KEY,
  SIPP_DIGEST,
  TOKEN
} from "./setup.js";

const allCommands = (setup: Awaited<ReturnType<typeof doSetup>>) =>
  setup.hosts.commands.map(({ command }) => command);

describe("perfkit run (orchestration)", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should pass compose every PERFKIT_* variable with digest-pinned images, give SIPp the capacity flags and write a valid report.json", async () => {
    // Arrange
    const setup = await doSetup();

    // Act
    const result = await perfkit([...MINIMAL, "--out", setup.out], setup.infra);

    // Assert
    expect(result.err).to.equal("");
    expect(result.code).to.equal(0);
    const runId = setup.runId();
    const up = setup.hosts.commands.find(
      ({ command }) =>
        command.includes("docker compose") && command.endsWith(" up -d")
    );
    expect(up?.host).to.equal("uut");
    const image = `pumpagubben/sipp:3.7.3@${SIPP_DIGEST}`;
    [
      `PERFKIT_IMAGE_UAS=${image}`,
      "PERFKIT_UUT_IP=10.116.0.",
      "PERFKIT_LOADGEN_IP=10.116.0.",
      "PERFKIT_VPC_CIDR=10.116.0.0/20",
      "PERFKIT_TARGET_VERSION=3.7.3"
    ].forEach((variable) => expect(up?.command).to.include(variable));
    const uac = allCommands(setup).find((command) =>
      command.includes("-sipp-uac ")
    );
    expect(uac).to.include(SIPP_IMAGE);
    expect(uac).to.match(
      / 10\.116\.0\.\d+:5062 -sf \/project\/sipp-uas\/uac_message\.xml -i 10\.116\.0\.\d+ -p 5080 /
    );
    expect(uac).to.include(
      "-r 50 -rp 1000 -rate_increase 50 -rate_interval 60 -rate_max 200 -no_rate_quit -l 2000 -d 0"
    );
    expect(uac).to.include(
      "-t u1 -buff_size 4194304 -trace_rtt -rtt_freq 10 -trace_stat -fd 10 -trace_counts -trace_err -trace_error_codes"
    );
    const text = await readFile(join(setup.out, runId, "report.json"), "utf8");
    const report = reportSchema.parse(JSON.parse(text));
    expect(report.run.infra.provider).to.equal("digitalocean");
    expect(report.run.tools).to.deep.equal({
      perfkit: "9.8.7",
      sipp: "3.7.3-27-gdde43e1"
    });
    expect(report.run.images).to.deep.equal({ uas: image });
    expect(report.benchmarks[0]).to.include({
      id: "sipp-uas",
      verdict: "passed"
    });
    expect(result.out).to.include(
      "[sipp-uas] passed: limit at least 200 messages/s\n"
    );
    expect(result.out).to.include("(1 of 1 benchmarks passed)");
    expect(setup.account.leftovers()).to.deep.equal({
      droplets: [],
      vpcs: [],
      firewalls: [],
      keys: []
    });
  });

  it("should exit 2 naming the service, before creating droplets, when a compose service lacks network_mode: host", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "perfkit-minimal-"));
    await cp(join(EXAMPLES, "minimal"), dir, { recursive: true });
    const compose = join(dir, "sipp-uas", "compose.yaml");
    await writeFile(
      compose,
      (await readFile(compose, "utf8")).replace(
        "    network_mode: host\n",
        '    ports: ["5062:5062/udp"]\n'
      )
    );
    const setup = await doSetup();

    // Act
    const result = await perfkit(
      [
        "run",
        "--config",
        join(dir, "perfkit.yaml"),
        "--target-version",
        "3.7.3"
      ],
      setup.infra
    );

    // Assert
    expect(result.code).to.equal(2);
    expect(result.err).to.equal(
      "perfkit: sipp-uas/compose.yaml: service uas must use network_mode: host (Docker's UDP port publishing distorts the results); nothing was created\n"
    );
    expect(setup.account.calls).to.deep.equal([]);
  });

  it("should exit 3 and delete everything when the UUT is not healthy within 5 minutes", async () => {
    // Arrange
    const setup = await doSetup();
    const writer = setup.hosts.onDocker;
    setup.hosts.onDocker = async (host, command, by) =>
      command.includes(" ps -a --format json")
        ? {
            code: 0,
            stdout: `{"Service":"uas","State":"running","Health":"starting"}\n`,
            stderr: ""
          }
        : writer(host, command, by);

    // Act
    const result = await perfkit([...MINIMAL, "--out", setup.out], setup.infra);

    // Assert
    expect(result.code).to.equal(3);
    expect(result.err).to.equal(
      "perfkit: the server under test for sipp-uas was not running and healthy within 5 minutes; no report was written\n"
    );
    expect(setup.agent.clock.slept.reduce((a, b) => a + b, 0)).to.be.at.least(
      5 * 60 * 1000
    );
    expect(
      allCommands(setup).some((command) =>
        command.includes(" down --remove-orphans")
      )
    ).to.equal(true);
    expect(setup.account.leftovers()).to.deep.equal({
      droplets: [],
      vpcs: [],
      firewalls: [],
      keys: []
    });
  });

  it("should never put PERFKIT_SSH_KEY or DIGITALOCEAN_TOKEN on a droplet, and give the load generator only the run-only key", async () => {
    // Arrange
    const setup = await doSetup({
      env: { DIGITALOCEAN_TOKEN: TOKEN, PERFKIT_SSH_KEY: SHARED_KEY }
    });

    // Act
    const result = await perfkit([...MINIMAL, "--out", setup.out], setup.infra);

    // Assert
    expect(result.code).to.equal(0);
    const disks = await setup.hosts.disks();
    const everything = [
      ...Object.values(disks),
      ...allCommands(setup),
      ...setup.hosts.uploads.flatMap(({ files }) => Object.values(files)),
      result.out,
      result.err,
      ...Object.values(await readTree(setup.out))
    ].join("\n");
    expect(everything).not.to.include("shared-secret-key");
    expect(everything).not.to.include(TOKEN);
    expect(disks["keys/agent"]).to.equal(AGENT_KEY);
    const keyFiles = Object.entries(disks).filter(([, text]) =>
      text.includes("PRIVATE KEY")
    );
    expect(keyFiles.map(([path]) => path)).to.deep.equal(["keys/agent"]);
    const uutCreate = setup.account.callsTo("createDroplet")[0]![0] as {
      user_data: string;
    };
    expect(uutCreate.user_data).to.include("agent");
  });

  it("should upload the CLI's own package version and start the agent without npx or github:", async () => {
    // Arrange
    const setup = await doSetup({ agentOnStart: false });

    // Act
    const result = await perfkit(
      [...MINIMAL, "--detach", "--out", setup.out],
      setup.infra
    );

    // Assert
    expect(result.code).to.equal(0);
    const agentUpload = setup.hosts.uploads.find(
      ({ remotePath }) => remotePath === "/opt/perfkit/agent"
    );
    expect(agentUpload?.host).to.equal("loadgen");
    expect(JSON.parse(agentUpload!.files["package.json"]!).version).to.equal(
      "9.8.7"
    );
    expect(Object.keys(agentUpload!.files).sort()).to.deep.equal([
      "dist/cli.js",
      "node_modules/yaml/package.json",
      "package.json"
    ]);
    const start = allCommands(setup).find((command) =>
      command.includes(" agent --run ")
    );
    expect(start).to.include(
      `${NODE_IMAGE} node /opt/perfkit/agent/dist/cli.js agent --run ${setup.runId()}`
    );
    expect(start).to.include("/var/run/docker.sock:/var/run/docker.sock");
    expect(start).not.to.match(/npx|github:/);
  });

  it("should exit 0 and delete nothing once the agent has started with --detach", async () => {
    // Arrange
    const setup = await doSetup({ agentOnStart: false });

    // Act
    const result = await perfkit(
      [...MINIMAL, "--detach", "--out", setup.out],
      setup.infra
    );

    // Assert
    expect(result.code).to.equal(0);
    expect(result.out).to.include(
      `run ${setup.runId()} started; collect it with: perfkit collect ${setup.runId()}\n`
    );
    expect(
      setup.account.calls.filter(({ method }) => method.startsWith("delete"))
    ).to.deep.equal([]);
  });

  it("should exit 4 from collect --wait before the end and 0 after it, deleting nothing, then collect writes the report and deletes everything", async () => {
    // Arrange
    const setup = await doSetup({ agentOnStart: false });
    await perfkit([...MINIMAL, "--detach", "--out", setup.out], setup.infra);
    const runId = setup.runId();
    const collect = (...args: string[]) =>
      perfkit(["collect", runId, "--out", setup.out, ...args], setup.infra);

    // Act
    const early = await collect("--wait", "--timeout", "1m");
    await setup.agent.run(runId);
    const waited = await collect("--wait");
    const kept = setup.account.leftovers();
    const done = await collect();

    // Assert
    expect(early.code).to.equal(4);
    expect(early.out).to.equal(`run ${runId} is still running\n`);
    expect(waited.code).to.equal(0);
    expect(kept.droplets).to.have.length(2);
    expect(done.code).to.equal(0);
    expect(
      reportSchema.safeParse(
        JSON.parse(
          await readFile(join(setup.out, runId, "report.json"), "utf8")
        )
      ).success
    ).to.equal(true);
    expect(setup.account.leftovers()).to.deep.equal({
      droplets: [],
      vpcs: [],
      firewalls: [],
      keys: []
    });
  });

  it("should add this machine's IP to the firewall before the first SSH of collect", async () => {
    // Arrange
    const setup = await doSetup({ agentOnStart: false });
    await perfkit([...MINIMAL, "--detach", "--out", setup.out], setup.infra);
    setup.infra.getPublicIp = async () => "198.51.100.23";
    setup.order.length = 0;

    // Act
    await perfkit(
      [
        "collect",
        setup.runId(),
        "--wait",
        "--timeout",
        "0s",
        "--out",
        setup.out
      ],
      setup.infra
    );

    // Assert
    expect(setup.order.slice(0, 2)).to.deep.equal([
      "updateFirewall",
      "ssh loadgen"
    ]);
    const update = setup.account.callsTo("updateFirewall")[0]![1] as {
      inbound_rules: Array<{
        ports?: string;
        sources: { addresses?: string[] };
      }>;
    };
    expect(
      update.inbound_rules.find(({ ports }) => ports === "22")?.sources
        .addresses
    ).to.include("198.51.100.23/32");
  });

  it("should exit 2 with the Contract's message when collect has no key for the run", async () => {
    // Arrange
    const setup = await doSetup();

    // Act
    const result = await perfkit(
      ["collect", "20261103T141210Z-bd3254a"],
      setup.infra
    );

    // Assert
    expect(result).to.deep.equal({
      code: 2,
      out: "",
      err: "perfkit: no SSH key for run 20261103T141210Z-bd3254a; set PERFKIT_SSH_KEY\n"
    });
    expect(setup.account.calls).to.deep.equal([]);
  });
});
