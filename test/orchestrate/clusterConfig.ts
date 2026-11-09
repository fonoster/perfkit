/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** A perfkit.yaml with cluster benchmarks, and fake Kubernetes tools. */
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROUTR_CONFIG } from "../fixtures.js";

export const LB_IP = "198.51.100.4";

/**
 * The Routr example plus a chart outside the project and two cluster
 * benchmarks: a TCP capacity ramp to registered callees, and a soak at half
 * its limit.
 */
export async function routrWithCluster(): Promise<string> {
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
        entry: { service: routr-edgeport-tcp, port: 5060 }
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
export function kubeAnswers(command: string) {
  if (!command.includes("alpine/k8s")) return undefined;
  if (command.includes("kubectl get services")) {
    return {
      code: 0,
      stdout: JSON.stringify({
        items: [
          {
            metadata: { name: "perfkit-other" },
            spec: { ports: [{ port: 80 }] }
          },
          {
            metadata: { name: "perfkit-routr-edgeport-tcp" },
            spec: { ports: [{ port: 5060 }] },
            status: { loadBalancer: { ingress: [{ ip: LB_IP }] } }
          }
        ]
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
