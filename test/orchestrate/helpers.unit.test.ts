/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeCommand,
  countComposeServices,
  isComposeUp,
  parseComposePs
} from "../../src/orchestrate/composeCommands.js";
import { demuxLogs } from "../../src/orchestrate/createDockerEngine.js";
import { parseDockerInfo } from "../../src/orchestrate/createStartRun.js";
import { findServicesWithoutHostNetwork } from "../../src/orchestrate/findServicesWithoutHostNetwork.js";
import {
  formatSpan,
  parseSpan
} from "../../src/orchestrate/formatResultLine.js";
import {
  buildOtelcolConfig,
  buildSamplerSpec
} from "../../src/orchestrate/sampler.js";
import {
  shellQuote,
  writeFileCommand
} from "../../src/orchestrate/shellQuote.js";
import { stageAgentPackage } from "../../src/orchestrate/stageAgentPackage.js";
import { fakePackage } from "./harness.js";

describe("orchestration helpers", () => {
  it("should quote shell words only when needed", () => {
    expect(shellQuote("a/b:c@d")).to.equal("a/b:c@d");
    expect(shellQuote("it's here")).to.equal(`'it'\\''s here'`);
  });

  it("should write any text through writeFileCommand", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "perfkit-wf-"));
    const text = "a\tb 'c' $HOME\n";

    // Act
    execFileSync("sh", ["-c", writeFileCommand(join(dir, "x", "f"), text)]);

    // Assert
    expect(await readFile(join(dir, "x", "f"), "utf8")).to.equal(text);
  });

  it("should list the services without network_mode: host", () => {
    const text =
      "services:\n  a: { network_mode: host }\n  b: { ports: ['5060:5060/udp'] }\n";
    expect(findServicesWithoutHostNetwork(text)).to.deep.equal(["b"]);
    expect(findServicesWithoutHostNetwork("")).to.deep.equal([]);
    expect(countComposeServices(text)).to.equal(2);
  });

  it("should run compose in the project directory with the env", () => {
    expect(
      composeCommand(
        {
          projectDir: "/opt/perfkit/project",
          file: "a/compose.yaml",
          name: "pk-x-a",
          env: { PERFKIT_UUT_IP: "10.0.0.2" }
        },
        ["up", "-d"]
      )
    ).to.equal(
      "cd /opt/perfkit/project && env PERFKIT_UUT_IP=10.0.0.2 docker compose -p pk-x-a -f a/compose.yaml up -d"
    );
  });

  it("should read compose ps as JSON lines or an array, and need running and healthy", () => {
    const lines = parseComposePs(
      '{"Service":"a","State":"running","Health":""}\n{"Service":"b","State":"running","Health":"healthy"}\n'
    );
    const array = parseComposePs(
      '[{"Service":"a","State":"running","Health":"starting"}]'
    );
    expect(isComposeUp(lines, 2)).to.equal(true);
    expect(isComposeUp(lines, 3)).to.equal(false);
    expect(isComposeUp(array, 1)).to.equal(false);
    expect(isComposeUp([], 0)).to.equal(false);
  });

  it("should split a Docker log stream into stdout and stderr", () => {
    const frame = (stream: number, text: string) => {
      const header = Buffer.alloc(8);
      header[0] = stream;
      header.writeUInt32BE(Buffer.byteLength(text), 4);
      return Buffer.concat([header, Buffer.from(text)]);
    };
    expect(
      demuxLogs(
        Buffer.concat([frame(1, "out "), frame(2, "err"), frame(1, "put")])
      )
    ).to.deep.equal({ stdout: "out put", stderr: "err" });
  });

  it("should demux a long log of small frames without overflowing the stack", () => {
    // A 6-hour sampler file read over SSH arrives as tens of thousands of
    // small frames; a recursive reader overflowed the stack on it.
    const frame = (stream: number, text: string) => {
      const body = Buffer.from(text);
      const header = Buffer.alloc(8);
      header[0] = stream;
      header.writeUInt32BE(body.length, 4);
      return Buffer.concat([header, body]);
    };
    const lines = Array.from({ length: 200_000 }, (_, i) => `${i}\n`);
    const { stdout, stderr } = demuxLogs(
      Buffer.concat(lines.map((line) => frame(1, line)))
    );
    expect(stdout).to.equal(lines.join(""));
    expect(stderr).to.equal("");
  });

  it("should read docker info and refuse what it can't read", () => {
    expect(
      parseDockerInfo("8;17179869184;Ubuntu 24.04.1 LTS;27.3.1\n")
    ).to.deep.equal({
      vcpus: 8,
      memoryMB: 16384,
      os: "Ubuntu 24.04.1 LTS",
      docker: "27.3.1"
    });
    expect(() => parseDockerInfo("")).to.throw("could not read docker info");
  });

  it("should parse and format spans like 5h50m", () => {
    expect(parseSpan("5h50m")).to.equal(21_000_000);
    expect(parseSpan("30s")).to.equal(30_000);
    expect(parseSpan("soon")).to.equal(null);
    expect(parseSpan("")).to.equal(null);
    expect(formatSpan(11_520_000)).to.equal("3h12m");
  });

  it("should match SIPp roles by their Call-ID prefix and UUT processes by their regex", () => {
    expect(
      buildSamplerSpec("uut", [{ name: "one", match: "dist/runner" }])
    ).to.equal("one\tdist/runner\n");
    expect(buildSamplerSpec("loadgen", [])).to.equal(
      "sipp-uac\tsipp .*-cid_str uac-\nsipp-register\tsipp .*-cid_str register-\nsipp-uas\tsipp .*-cid_str uas-\n"
    );
    expect(buildOtelcolConfig("10.0.0.3", "/raw/spans.jsonl")).to.include(
      "endpoint: 10.0.0.3:4318"
    );
  });

  it("should name each uac instance's SIPp process apart, in the cluster lane too", () => {
    expect(buildSamplerSpec("loadgen", [], "", 3)).to.equal(
      "sipp-uac\tsipp .*-cid_str uac-\nsipp-uac-2\tsipp .*-cid_str uac2-\nsipp-uac-3\tsipp .*-cid_str uac3-\nsipp-register\tsipp .*-cid_str register-\nsipp-uas\tsipp .*-cid_str uas-\n"
    );
    expect(buildSamplerSpec("loadgen", [], "k8s-", 2)).to.include(
      "sipp-uac-2\tsipp .*-cid_str k8s-uac2-\n"
    );
  });

  it("should stage dist, package.json and only the production dependencies", async () => {
    // Arrange
    const pkg = await fakePackage("1.2.3");
    const dest = await mkdtemp(join(tmpdir(), "perfkit-dest-"));

    // Act
    const version = await stageAgentPackage(pkg, dest);

    // Assert
    expect(version).to.equal("1.2.3");
    const staged = execFileSync("find", [".", "-type", "f"], {
      cwd: dest,
      encoding: "utf8"
    })
      .trim()
      .split("\n")
      .sort();
    expect(staged).to.deep.equal([
      "./dist/cli.js",
      "./node_modules/yaml/package.json",
      "./package.json"
    ]);
  });

  it("should refuse a package that was not built", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perfkit-nobuild-"));
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(join(dir, "package.json"), '{"version":"1.0.0"}')
    );
    const error = await stageAgentPackage(dir, join(dir, "out")).catch(
      (e: Error) => e
    );
    expect((error as Error).message).to.include("build perfkit first");
  });
});
