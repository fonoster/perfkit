/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { BenchmarkConfig } from "../schemas/index.js";
import { imageEnvOf } from "./imageEnvOf.js";
import type { RunState } from "./runState.schema.js";

/**
 * The PERFKIT_* variables a project's compose file and setup script get:
 * one digest-pinned PERFKIT_IMAGE_<NAME> per image, the two private IPs,
 * the VPC range, the target version and, with telemetry.otlp, the OTLP
 * endpoint and the trace ratio. `<NAME>` is the image key in uppercase with
 * every other character turned into `_`.
 */
export function buildComposeEnv(
  state: RunState,
  benchmark: BenchmarkConfig
): Record<string, string> {
  const images = imageEnvOf(state.plan.images);
  const telemetry: Record<string, string> = benchmark.telemetry.otlp
    ? {
        PERFKIT_OTLP_ENDPOINT: `http://${state.hosts.loadgenIp}:4318`,
        PERFKIT_TRACE_RATIO: String(benchmark.telemetry.sampleRatio)
      }
    : {};
  return {
    ...images,
    PERFKIT_UUT_IP: state.hosts.uutIp,
    PERFKIT_LOADGEN_IP: state.hosts.loadgenIp,
    PERFKIT_VPC_CIDR: state.hosts.vpcCidr,
    ...telemetry,
    PERFKIT_TARGET_VERSION: state.plan.targetVersion
  };
}
