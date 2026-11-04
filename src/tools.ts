/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The load tools perfkit runs, pinned by digest so two runs of the same
 * perfkit use the same binaries. The image is amd64 only and its entrypoint
 * is a shell, not SIPp: run the binary as `/sipp/sipp`. It reports
 * `SIPp v3.7.3-27-gdde43e1`.
 */
export const SIPP_IMAGE =
  "pumpagubben/sipp:3.7.3@sha256:ceeff6749d6eb02b11776d3417cffe92235d4cac398d3209855a7bb77f585dd1";

/** The path of the SIPp binary inside SIPP_IMAGE. */
export const SIPP_BINARY = "/sipp/sipp";

/** Runs the agent and a project's setup script. */
export const NODE_IMAGE =
  "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";

/**
 * The agent's hands: the Docker CLI with the compose plugin and an OpenSSH
 * client. The agent runs each host command in a short-lived container of it.
 */
export const DOCKER_CLI_IMAGE =
  "docker:27-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c";

/** Runs the sampler, with busybox sh and awk. */
export const SAMPLER_IMAGE =
  "alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc";

/** The OpenTelemetry Collector (contrib) for soaks with telemetry.otlp. */
export const OTELCOL_IMAGE =
  "otel/opentelemetry-collector-contrib:0.112.0@sha256:2203eea06554f892c765d6eff8069cdf64ae8d4516526d03cab4a70e82775495";
