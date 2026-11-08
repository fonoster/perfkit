/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshResult } from "../../src/infra/index.js";
import { reportSchema } from "../../src/schemas/index.js";
import { capacityRaw } from "../analyze/builders.js";
import { fakeRegistry, infraDeps, perfkit } from "../infra/fakes.js";
import { kubeAnswers, LB_IP, routrWithCluster } from "./clusterConfig.js";
import { fakePackage, FakeHosts } from "./harness.js";
import { agentRunner, PASSING_STEPS, sippWriter } from "./setup.js";

const OK: SshResult = { code: 0, stdout: "", stderr: "" };

/** `kind`, `docker` and the Kubernetes tools as this machine would answer. */
function localTools(script: string): SshResult | undefined {
  if (script.startsWith("kind create cluster")) return OK;
  if (script.startsWith("kind get kubeconfig")) {
    return { ...OK, stdout: "apiVersion: v1\n# internal KIND-SECRET\n" };
  }
  if (script.startsWith("kind load docker-image")) return OK;
  if (script.startsWith("kind delete cluster")) return OK;
  if (script.startsWith("docker network inspect kind")) {
    return { ...OK, stdout: "fc00:f853:ccd:e793::/64 172.18.0.0/16 \n" };
  }
  if (script.startsWith("docker image inspect")) {
    return script.includes("routr-connect:m4-load")
      ? OK
      : { code: 1, stdout: "", stderr: "No such image" };
  }
  if (script.includes("alpine/k8s") && script.includes("kubectl version")) {
    return {
      ...OK,
      stdout: JSON.stringify({ serverVersion: { gitVersion: "v1.33.1" } })
    };
  }
  if (script.includes("alpine/k8s") && script.includes("helm template")) {
    return {
      ...OK,
      stdout:
        "kind: Deployment\nspec:\n  containers:\n    - name: connect\n      image: routr-connect:m4-load\n"
    };
  }
  if (script.includes("alpine/k8s")) return OK;
  return undefined;
}

async function localClusterSetup() {
  const home = await mkdtemp(join(tmpdir(), "perfkit-home-"));
  const hosts = await FakeHosts.create({ local: home });
  const writer = sippWriter(hosts, (id) =>
    id === "k8s-capacity"
      ? {
          ...capacityRaw(PASSING_STEPS),
          "uac_register_8_counts.csv":
            "CurrentTime;ElapsedTime;0_REGISTER_Sent;2_401_Recv;3_REGISTER_Sent;5_200_Recv;\n2026-11-03T14:12:10Z;00:00:10:000000;200;200;200;200;\n"
        }
      : capacityRaw(PASSING_STEPS)
  );
  hosts.onDocker = async (host, command) =>
    kubeAnswers(command) ?? writer(host, command);
  hosts.onAgentStart = async (_host, command) => {
    const runId = / agent --run (\S+)/.exec(command)?.[1] as string;
    const root = join(home, ".perfkit", "runs", runId, "root");
    await agentRunner(hosts, root).run(runId);
  };
  const cli: string[] = [];
  const out = await mkdtemp(join(tmpdir(), "perfkit-out-"));
  const infra = infraDeps({
    home,
    registry: fakeRegistry(),
    packageRoot: await fakePackage("9.8.7"),
    executeBenchmarks: undefined,
    runProgram: async (_file, args) => {
      const script = args[1] as string;
      cli.push(script);
      return localTools(script) ?? hosts.exec("loadgen", script, "cli");
    }
  });
  return { hosts, infra, out, cli };
}

describe("perfkit run --local with a helm benchmark", () => {
  it("should run it on a kind cluster with MetalLB, load the local images, put SIPp on the kind network and delete the cluster", async () => {
    // Arrange
    const config = await routrWithCluster();
    const { hosts, infra, out, cli } = await localClusterSetup();

    // Act
    const result = await perfkit(
      [
        "run",
        "--config",
        config,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "k8s-capacity",
        "--local",
        "--out",
        out
      ],
      infra
    );

    // Assert
    expect(result.err).to.equal("");
    expect(result.code).to.equal(0);
    expect(infra.account.calls).to.deep.equal([]);
    const name = /cluster +kind (perfkit-\S+),/.exec(result.out)?.[1] as string;
    expect(name).to.match(/^perfkit-\d{8}t\d{6}z-[0-9a-f]{7}$/);
    const index = (prefix: string) =>
      cli.findIndex((s) => s.startsWith(prefix));
    expect(
      index(`kind create cluster --name ${name} --config `)
    ).to.be.greaterThan(-1);
    const metallb = cli.find((s) => s.includes("metallb-native.yaml"))!;
    expect(metallb).to.include("--network kind");
    expect(metallb).to.include(
      "kubectl -n metallb-system wait --for=condition=Ready pods --all --timeout=180s"
    );
    expect(cli).to.include(
      `kind load docker-image routr-connect:m4-load --name ${name}`
    );
    expect(
      cli.some((s) => s.startsWith("kind load docker-image fonoster/"))
    ).to.equal(false);
    expect(result.out).to.include(`loaded routr-connect:m4-load into ${name}`);
    const uac = hosts.commands.find(
      ({ command }) =>
        command.includes("-sipp-uac ") && command.includes("run -d")
    )!.command;
    expect(uac).to.include("--network kind --ip 172.18.254.251");
    expect(uac).to.include(`${LB_IP}:5060`);
    expect(uac).to.include("-i 172.18.254.251 -p 6080");
    const register = hosts.commands.find(
      ({ command }) =>
        command.includes("-sipp-register ") && command.includes("run -d")
    )!.command;
    expect(register).to.include("--network kind --ip 172.18.254.252");
    expect(cli.at(-1)).to.equal(`kind delete cluster --name ${name}`);
    expect(result.out).to.include(
      `removed the run's containers and the kind cluster ${name}`
    );
    const runId = /local run (\S+)\)/.exec(result.out)?.[1] as string;
    const report = reportSchema.parse(
      JSON.parse(await readFile(join(out, runId, "report.json"), "utf8"))
    );
    expect(report.run.infra.cluster).to.deep.equal({
      provider: "kind",
      nodes: 3,
      size: "local",
      version: "v1.33.1"
    });
  });

  it("should delete the kind cluster when starting the run fails", async () => {
    // Arrange
    const config = await routrWithCluster();
    const { infra, out, cli } = await localClusterSetup();
    const run = infra.runProgram;
    infra.runProgram = async (file, args, options) =>
      (args[1] as string).includes("metallb-native.yaml")
        ? { code: 1, stdout: "", stderr: "error: webhook not ready" }
        : run(file, args, options);

    // Act
    const result = await perfkit(
      [
        "run",
        "--config",
        config,
        "--target-version",
        "2.31.5",
        "--benchmarks",
        "k8s-capacity",
        "--local",
        "--out",
        out
      ],
      infra
    );

    // Assert
    expect(result.code).to.equal(3);
    expect(result.err).to.include(
      "could not install MetalLB: error: webhook not ready"
    );
    expect(cli.at(-1)).to.match(/^kind delete cluster --name perfkit-/);
  });
});
