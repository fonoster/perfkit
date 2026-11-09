/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildHelmEnv } from "../../src/orchestrate/buildHelmEnv.js";
import { renderHelmValues } from "../../src/orchestrate/renderHelmValues.js";
import { makePlan } from "../infra/fakes.js";

describe("renderHelmValues", () => {
  it("should replace every PERFKIT_* placeholder and keep the rest byte for byte", () => {
    const text =
      'externalAddrs:\n  - "${PERFKIT_ENTRY_IP}"\nimage: { tag: "${PERFKIT_TARGET_VERSION}" }  # ${HOME}\n';
    expect(
      renderHelmValues(
        text,
        { PERFKIT_ENTRY_IP: "198.51.100.4", PERFKIT_TARGET_VERSION: "3.0.0" },
        "k8s/values.yaml"
      )
    ).to.equal(
      'externalAddrs:\n  - "198.51.100.4"\nimage: { tag: "3.0.0" }  # ${HOME}\n'
    );
  });

  it("should throw naming an unknown placeholder and the file", () => {
    expect(() =>
      renderHelmValues(
        "a: ${PERFKIT_FOO}",
        { PERFKIT_ENTRY_IP: "x" },
        "k8s/values.yaml"
      )
    ).to.throw(
      "unknown placeholder ${PERFKIT_FOO} in k8s/values.yaml; known: PERFKIT_ENTRY_IP"
    );
  });
});

describe("buildHelmEnv", () => {
  it("should give the digest-pinned images, the entry address and the target version", async () => {
    // Arrange
    const plan = await makePlan();

    // Act
    const env = buildHelmEnv({ plan }, "198.51.100.4");
    const before = buildHelmEnv({ plan }, null);

    // Assert
    expect(env.PERFKIT_ENTRY_IP).to.equal("198.51.100.4");
    expect(before.PERFKIT_ENTRY_IP).to.equal("0.0.0.0");
    expect(env.PERFKIT_TARGET_VERSION).to.equal("2.31.5");
    expect(env.PERFKIT_IMAGE_EDGEPORT).to.match(
      /^fonoster\/routr-edgeport:2\.31\.5@sha256:/
    );
  });
});
