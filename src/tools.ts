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
