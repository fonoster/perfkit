/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildKubeSamplerSpec } from "../../src/orchestrate/buildKubeSamplerSpec.js";
import { kubeCommand } from "../../src/orchestrate/kubeCommand.js";
import { KUBE_TOOLS_IMAGE } from "../../src/tools.js";

const cluster = {
  provider: "kind" as const,
  name: "perfkit-20261108t120000z-abcdef0",
  size: "local",
  nodes: 1,
  version: "v1.33.1",
  network: "kind",
  sippIps: {
    uac: "172.18.254.251",
    register: "172.18.254.252",
    uas: "172.18.254.253"
  },
  fixedIps: true
};

describe("kubeCommand", () => {
  it("should run the script in the Kubernetes tools on the cluster's network with KUBECONFIG set", () => {
    const command = kubeCommand(
      { runId: "20261108T120000Z-abcdef0", root: "/opt/perfkit", cluster },
      "kubectl get pods"
    );
    expect(command).to.equal(
      `docker run --rm --label perfkit.run=20261108T120000Z-abcdef0 --network kind -v /opt/perfkit:/opt/perfkit -e KUBECONFIG=/opt/perfkit/keys/kubeconfig ${KUBE_TOOLS_IMAGE} sh -c 'kubectl get pods'`
    );
  });

  it("should detach a named container, on the host network without a cluster", () => {
    const command = kubeCommand(
      { runId: "20261108T120000Z-abcdef0", root: "/opt/perfkit" },
      "true",
      { name: "sampler", workdir: "/opt/perfkit/project", env: { A: "1" } }
    );
    expect(command).to.include("docker run -d --name sampler");
    expect(command).to.include("--network host");
    expect(command).to.include("-w /opt/perfkit/project -e A=1 -e KUBECONFIG=");
  });
});

describe("buildKubeSamplerSpec", () => {
  it("should write one name and label selector per line", () => {
    expect(
      buildKubeSamplerSpec([
        { name: "edgeport", selector: "service=edgeport" },
        { name: "db", selector: "app.kubernetes.io/name=postgresql" }
      ])
    ).to.equal(
      "edgeport\tservice=edgeport\ndb\tapp.kubernetes.io/name=postgresql\n"
    );
  });
});
