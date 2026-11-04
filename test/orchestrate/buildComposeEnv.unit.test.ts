/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { buildComposeEnv, type RunState } from "../../src/orchestrate/index.js";
import type { BenchmarkConfig } from "../../src/schemas/index.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

const image = (key: string, tag: string) => ({
  key,
  name: "fonoster/routr-edgeport",
  tag,
  digest: DIGEST,
  ref: `fonoster/routr-edgeport:${tag}@${DIGEST}`
});

const STATE = {
  plan: {
    targetVersion: "2.32.0",
    images: [
      image("edgeport", "2.32.0"),
      image("edgeportGo", "2.32.0-go-experimental"),
      image("routr-one.v2", "2.32.0")
    ]
  },
  hosts: {
    uutIp: "10.116.0.2",
    loadgenIp: "10.116.0.3",
    vpcCidr: "10.116.0.0/20"
  }
} as unknown as RunState;

const BENCHMARK = {
  telemetry: { otlp: false, sampleRatio: 0.01 }
} as unknown as BenchmarkConfig;

describe("buildComposeEnv", () => {
  it("should name each image PERFKIT_IMAGE_<KEY>, upper-cased with every other character turned into _", () => {
    // Act
    const env = buildComposeEnv(STATE, BENCHMARK);

    // Assert
    expect(env).to.deep.equal({
      PERFKIT_IMAGE_EDGEPORT: `fonoster/routr-edgeport:2.32.0@${DIGEST}`,
      PERFKIT_IMAGE_EDGEPORTGO: `fonoster/routr-edgeport:2.32.0-go-experimental@${DIGEST}`,
      PERFKIT_IMAGE_ROUTR_ONE_V2: `fonoster/routr-edgeport:2.32.0@${DIGEST}`,
      PERFKIT_UUT_IP: "10.116.0.2",
      PERFKIT_LOADGEN_IP: "10.116.0.3",
      PERFKIT_VPC_CIDR: "10.116.0.0/20",
      PERFKIT_TARGET_VERSION: "2.32.0"
    });
  });
});
