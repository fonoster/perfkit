/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import type { RunProgram } from "../infra/index.js";
import { RUN_LABEL } from "../orchestrate/constants.js";
import { shellJoin } from "../orchestrate/shellQuote.js";
import { KUBE_TOOLS_IMAGE, METALLB_MANIFEST } from "../tools.js";
import { imagesOfManifests } from "./imagesOfManifests.js";
import { kindAddresses } from "./kindAddresses.js";
import {
  type CreateKindClusterInput,
  createKindClusterInputSchema
} from "./kindCluster.schema.js";

export interface KindCluster {
  /** The kubeconfig for the kind network (`kind get kubeconfig --internal`). */
  kubeconfig: string;
  /** The server's version, like v1.33.1. */
  version: string;
  sippIps: { uac: string; register: string; uas: string };
  /** The local images loaded into the cluster. */
  loaded: string[];
}

/**
 * Creates `createKindCluster`, the cluster of a --local run: one kind node
 * named `perfkit-<run id>`, MetalLB in L2 mode with a pool on the kind
 * network so the entry Service gets a load balancer address as on DOKS,
 * and every image the charts use (or `images:` names) that exists on this
 * machine loaded into the node. The Kubernetes tools run in a container on
 * the kind network. It never deletes the cluster; the caller does, on every
 * exit path.
 *
 * @param deps - Local programs (`kind`, `docker`), and where to write files
 * @throws with what failed; the cluster may exist
 */
export function createKindCluster(deps: {
  run: RunProgram;
  writeFile: (path: string, text: string) => Promise<void>;
}) {
  const sh = (script: string, timeoutMs = 10 * 60 * 1000) =>
    deps.run("sh", ["-c", script], { timeoutMs });
  const must = async (what: string, script: string, timeoutMs?: number) => {
    const out = await sh(script, timeoutMs);
    if (out.code !== 0) {
      const last =
        (out.stderr || out.stdout).trim().split("\n").pop() ||
        `exit ${out.code}`;
      throw new Error(`${what}: ${last}`);
    }
    return out.stdout;
  };

  const fn = async (input: CreateKindClusterInput): Promise<KindCluster> => {
    const kubeconfigPath = `${input.dir}/kubeconfig`;
    const tools = (script: string, mounts: string[] = []) =>
      shellJoin([
        "docker",
        "run",
        "--rm",
        "--label",
        `${RUN_LABEL}=${input.runId}`,
        "--network",
        "kind",
        "-v",
        `${kubeconfigPath}:/kubeconfig:ro`,
        ...mounts.flatMap((mount) => ["-v", mount]),
        "-e",
        "KUBECONFIG=/kubeconfig",
        KUBE_TOOLS_IMAGE,
        "sh",
        "-c",
        script
      ]);

    await must(
      `could not create the kind cluster ${input.name}`,
      shellJoin([
        "kind",
        "create",
        "cluster",
        "--name",
        input.name,
        "--wait",
        "5m"
      ]),
      15 * 60 * 1000
    );
    const kubeconfig = await must(
      "could not read the kind cluster's kubeconfig",
      shellJoin([
        "kind",
        "get",
        "kubeconfig",
        "--name",
        input.name,
        "--internal"
      ])
    );
    await deps.writeFile(kubeconfigPath, kubeconfig);

    const subnets = await must(
      "could not read the kind network",
      `docker network inspect kind -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}'`
    );
    const addresses = subnets
      .trim()
      .split(/\s+/)
      .map(kindAddresses)
      .find((value) => value !== null);
    if (!addresses) {
      throw new Error(
        `the kind network has no IPv4 subnet of /24 or larger: ${subnets.trim() || "none"}`
      );
    }

    const pool = [
      "apiVersion: metallb.io/v1beta1",
      "kind: IPAddressPool",
      "metadata: { name: perfkit, namespace: metallb-system }",
      `spec: { addresses: ["${addresses.pool}"] }`,
      "---",
      "apiVersion: metallb.io/v1beta1",
      "kind: L2Advertisement",
      "metadata: { name: perfkit, namespace: metallb-system }",
      "spec: { ipAddressPools: [perfkit] }",
      ""
    ].join("\n");
    await deps.writeFile(`${input.dir}/metallb-pool.yaml`, pool);
    await must(
      "could not install MetalLB",
      tools(
        [
          `kubectl apply -f ${METALLB_MANIFEST} >/dev/null`,
          "kubectl -n metallb-system wait --for=condition=Ready pods --all --timeout=180s >/dev/null",
          // The webhook answers a little after its pod is Ready.
          "n=0; until kubectl apply -f /pool.yaml >/dev/null; do n=$((n+1)); [ $n -ge 20 ] && exit 1; sleep 3; done"
        ].join(" && "),
        [`${input.dir}/metallb-pool.yaml:/pool.yaml:ro`]
      )
    );
    const versionJson = await must(
      "could not read the kind cluster's version",
      tools("kubectl version -o json")
    );
    const version =
      (JSON.parse(versionJson) as { serverVersion?: { gitVersion?: string } })
        .serverVersion?.gitVersion ?? "unknown";

    const templated = await Promise.all(
      input.charts.map(({ chart, values }) =>
        sh(
          tools("helm template perfkit /chart -f /values.yaml", [
            `${chart}:/chart:ro`,
            `${values}:/values.yaml:ro`
          ])
        ).then((out) => (out.code === 0 ? imagesOfManifests(out.stdout) : []))
      )
    );
    const candidates = [...new Set([...templated.flat(), ...input.images])];
    const present = await Promise.all(
      candidates.map(async (image) =>
        (await sh(shellJoin(["docker", "image", "inspect", image]), 60_000))
          .code === 0
          ? image
          : null
      )
    );
    const loaded = present.filter((image): image is string => image !== null);
    await loaded.reduce(
      (previous, image) =>
        previous.then(async () => {
          await must(
            `could not load ${image} into the kind cluster`,
            shellJoin([
              "kind",
              "load",
              "docker-image",
              image,
              "--name",
              input.name
            ]),
            15 * 60 * 1000
          );
        }),
      Promise.resolve()
    );
    return { kubeconfig, version, sippIps: addresses.sippIps, loaded };
  };

  return withErrorHandlingAndValidation(fn, createKindClusterInputSchema);
}
