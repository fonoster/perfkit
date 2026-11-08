/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { capacityRaw, soakRaw } from "../analyze/builders.js";
import { ROUTR_CONFIG } from "../fixtures.js";
import { fakeRegistry, perfkit } from "../infra/fakes.js";
import { doSetup, PASSING_STEPS } from "./setup.js";

const LB_IP = "198.51.100.4";

/**
 * The Routr example plus a chart outside the project and two cluster
 * benchmarks: a TCP capacity ramp to registered callees, and a soak at half
 * its limit.
 */
async function routrWithCluster(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "perfkit-k8s-"));
  const perf = join(root, "perf");
  await cp(dirname(ROUTR_CONFIG), perf, { recursive: true });
  await mkdir(join(root, "chart", "templates"), { recursive: true });
  await writeFile(
    join(root, "chart", "Chart.yaml"),
    "apiVersion: v2\nname: uut\nversion: 0.1.0\n"
  );
  await mkdir(join(perf, "k8s"), { recursive: true });
  await writeFile(
    join(perf, "k8s", "values.yaml"),
    'edgeport:\n  externalAddrs: ["${PERFKIT_ENTRY_IP}"]\n  image: { tag: "${PERFKIT_TARGET_VERSION}" }\n'
  );
  await writeFile(join(perf, "k8s", "seed.sh"), "echo seeded\n");
  const rows = Array.from({ length: 200 }, (_, i) => `callee${i};pass${i}`);
  await writeFile(
    join(perf, "one-soak", "callees.csv"),
    ["SEQUENTIAL", ...rows, ""].join("\n")
  );
  const yaml = (await readFile(ROUTR_CONFIG, "utf8")).replace(
    "  maxLifetime: 9h",
    "  cluster: { size: c-8, nodes: 3 }\n  maxLifetime: 9h"
  );
  const helm = `    uut:
      helm:
        chart: ../chart
        values: k8s/values.yaml
        entry: { service: perfkit-routr-edgeport-tcp, port: 5060 }
        setup: k8s/seed.sh
        pods:
          - { name: one, selector: "service=one" }
          - { name: edgeport, selector: "service=edgeport" }
          - { name: postgres, selector: "app.kubernetes.io/name=postgresql" }`;
  await writeFile(
    join(perf, "perfkit.yaml"),
    `${yaml}  - id: k8s-capacity
    kind: capacity
    title: Routr on Kubernetes
    narrative: { what: Calls on Kubernetes., why: Capacity., how: SIPp ramps calls over TCP. }
${helm}
    load:
      tool: sipp
      transport: tcp
      register: { scenario: one-soak/uac_register.xml, users: one-soak/callees.csv }
      uas: { scenario: one-soak/uas_answer.xml }
      uac: { scenario: edgeport-echo/uac_message.xml }
      rate: { start: 50, step: 50, every: 60s, max: 200 }
    thresholds: { p99LatencyMs: 150, failedCallsPct: 0.1 }
  - id: k8s-soak
    kind: soak
    title: Routr on Kubernetes, six hours
    narrative: { what: A soak on Kubernetes., why: Leaks., how: Half the limit. }
    duration: 6h
    warmup: 30m
${helm}
    load:
      tool: sipp
      transport: tcp
      register: { scenario: one-soak/uac_register.xml, users: one-soak/callees.csv }
      uas: { scenario: one-soak/uas_answer.xml }
      uac: { scenario: one-soak/uac_invite.xml, users: one-soak/callers.csv }
      hold: 30s
      rate: { fromCapacity: k8s-capacity, fraction: 0.5, fallbackCps: 20 }
    thresholds: { memoryGrowthMBPerHour: 5, failedCallsPct: 0.1, restarts: 0 }
`
  );
  return join(perf, "perfkit.yaml");
}

/** Answers the Kubernetes tools: an LB address and Ready pods. */
function kubeAnswers(command: string) {
  if (!command.includes("alpine/k8s")) return undefined;
  if (command.includes("kubectl get service")) {
    return {
      code: 0,
      stdout: JSON.stringify({
        spec: { ports: [{ port: 5060 }] },
        status: { loadBalancer: { ingress: [{ ip: LB_IP }] } }
      }),
      stderr: ""
    };
  }
  if (command.includes("kubectl get pods")) {
    return {
      code: 0,
      stdout: JSON.stringify({
        items: [
          {
            metadata: { name: "edgeport-0" },
            status: {
              phase: "Running",
              conditions: [{ type: "Ready", status: "True" }]
            }
          }
        ]
      }),
      stderr: ""
    };
  }
  return { code: 0, stdout: "", stderr: "" };
}

async function clusterRun(selected: string) {
  const config = await routrWithCluster();
  const files = (id: string) =>
    id === "k8s-capacity"
      ? {
          ...capacityRaw(PASSING_STEPS),
          "uac_register_8_counts.csv": [
            "CurrentTime;ElapsedTime;0_REGISTER_Sent;2_401_Recv;3_REGISTER_Sent;5_200_Recv;",
            "2026-11-03T14:12:10Z;00:00:10:000000;200;200;200;200;",
            ""
          ].join("\n")
        }
      : soakRaw({ warmupS: 1800, afterS: 21600 });
  const setup = await doSetup({ agentOnStart: false, files });
  setup.infra.registry = fakeRegistry();
  const writer = setup.hosts.onDocker;
  setup.hosts.onDocker = async (host, command, by) =>
    kubeAnswers(command) ?? writer(host, command, by);
  const started = await perfkit(
    [
      "run",
      "--config",
      config,
      "--target-version",
      "2.31.5",
      "--benchmarks",
      selected,
      "--detach",
      "--out",
      setup.out
    ],
    setup.infra
  );
  return { setup, started };
}

const agentCommands = (setup: Awaited<ReturnType<typeof doSetup>>) =>
  setup.hosts.commands
    .filter(({ by }) => by === "agent")
    .map(({ command }) => command);

describe("a run with a Kubernetes cluster", () => {
  it("should hand the kubeconfig and the chart to the load generator only, mode 600, never into run.json", async () => {
    // Act
    const { setup, started } = await clusterRun("k8s-capacity");

    // Assert
    expect(started.err).to.equal("");
    expect(started.code).to.equal(0);
    const root = setup.hosts.roots.loadgen;
    expect(await readFile(join(root, "keys", "kubeconfig"), "utf8")).to.include(
      "KUBE-SECRET"
    );
    expect(
      await readFile(join(root, "charts", "k8s-capacity", "Chart.yaml"), "utf8")
    ).to.include("name: uut");
    const runJson = await readFile(join(root, "run.json"), "utf8");
    expect(runJson).not.to.include("KUBE-SECRET");
    expect(JSON.parse(runJson).cluster).to.deep.include({
      provider: "digitalocean",
      nodes: 3,
      size: "c-8",
      version: "1.33.1-do.0",
      network: "host",
      fixedIps: false
    });
    expect(
      setup.hosts.commands.some(({ command }) =>
        command.includes("chmod 600 /opt/perfkit/keys/kubeconfig")
      )
    ).to.equal(true);
    expect(
      setup.hosts.commands
        .filter(({ host }) => host === "uut")
        .some(({ command }) => command.includes("KUBE-SECRET"))
    ).to.equal(false);
  });

  it("should install metrics-server and the chart, resolve the entry, upgrade with it, wait for Ready pods and seed before SIPp", async () => {
    // Arrange
    const { setup } = await clusterRun("k8s-capacity");

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup);
    const index = (needle: string) =>
      commands.findIndex((c) => c.includes(needle));
    const steps = [
      "helm upgrade --install metrics-server",
      "helm upgrade --install perfkit /opt/perfkit/charts/k8s-capacity -n k8s-capacity --create-namespace",
      "kubectl get service perfkit-routr-edgeport-tcp -n k8s-capacity -o json",
      "--wait --timeout 15m",
      "kubectl get pods -n k8s-capacity -o json",
      "bash k8s/seed.sh k8s-capacity one-soak/callees.csv",
      "-sipp-register ",
      "-sipp-uac ",
      "helm uninstall perfkit -n k8s-capacity"
    ].map(index);
    steps.forEach((value) => expect(value).to.be.greaterThan(-1));
    expect([...steps].sort((a, b) => a - b)).to.deep.equal(steps);
    const root = setup.hosts.roots.loadgen;
    expect(
      await readFile(join(root, "helm", "k8s-capacity", "values.yaml"), "utf8")
    ).to.equal(
      `edgeport:\n  externalAddrs: ["${LB_IP}"]\n  image: { tag: "2.31.5" }\n`
    );
    const uac = commands.find(
      (c) => c.includes("-sipp-uac ") && c.includes("run -d")
    )!;
    expect(uac).to.include("--ulimit nofile=65536:65536");
    expect(uac).to.include(`${LB_IP}:5060`);
    expect(uac).to.match(
      /-p 6080 -cid_str '?k8s-uac-20261103t141210z-bd3254a-%u-%p@%s/
    );
    expect(uac).to.include("-t tn");
    expect(uac).to.match(/-i 203\.0\.113\.\d+ /);
    expect(
      commands.some(
        (c) =>
          c.includes("kube-sampler.sh") &&
          c.includes("k8s-capacity-sampler-uut")
      )
    ).to.equal(true);
    expect(commands.some((c) => c.includes("compose"))).to.equal(false);
  });

  it("should run the soak at half the capacity limit, beside the server soak, and record where its rate came from", async () => {
    // Arrange
    const { setup } = await clusterRun("k8s-capacity,k8s-soak,one-soak");

    // Act
    const outcome = await setup.agent.run(setup.runId());

    // Assert
    expect(outcome).to.deep.equal({ status: "done" });
    const commands = agentCommands(setup);
    const startOf = (id: string) =>
      commands.findIndex(
        (c) => c.includes(`-${id}-sipp-uac `) && c.includes("run -d")
      );
    const stopOf = (id: string) =>
      commands.findIndex(
        (c) => c.includes(`kill -s USR1 `) && c.includes(`-${id}-sipp-uac`)
      );
    // The capacity ramp ends before either soak starts.
    expect(stopOf("k8s-capacity")).to.be.lessThan(startOf("k8s-soak"));
    expect(stopOf("k8s-capacity")).to.be.lessThan(startOf("one-soak"));
    // The soaks start together: the server soak's first step comes before
    // the cluster soak's SIPp starts, not after it ends.
    const serverFirst = commands.findIndex((c) =>
      c.startsWith("mkdir -p /opt/perfkit/raw/one-soak")
    );
    expect(serverFirst).to.be.greaterThan(stopOf("k8s-capacity"));
    expect(serverFirst).to.be.lessThan(startOf("k8s-soak"));
    expect(startOf("one-soak")).to.be.greaterThan(-1);
    const soakUac = commands[startOf("k8s-soak")]!;
    expect(soakUac).to.include("-r 100 -rp 1000");
    const root = setup.hosts.roots.loadgen;
    expect(await readFile(join(root, "progress.log"), "utf8")).to.include(
      "[k8s-soak] rate 100 calls/s: 0.5 × the limit of k8s-capacity (200 calls/s)"
    );
    const meta = JSON.parse(
      await readFile(join(root, "raw", "k8s-soak", "meta.json"), "utf8")
    );
    expect(meta.load).to.deep.equal({
      cps: 100,
      holdS: 30,
      rateSource: { fromCapacity: "k8s-capacity", limit: 200, fraction: 0.5 }
    });
    expect(meta.tool).to.equal("SIPp 3.7.3, TCP");
  });
});
