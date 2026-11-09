/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { imageEnvOf } from "./imageEnvOf.js";
import type { RunState } from "./runState.schema.js";

/**
 * The `${PERFKIT_*}` placeholders of a Helm values file, and the variables
 * of its setup script: one digest-pinned PERFKIT_IMAGE_<NAME> per image,
 * the entry Service's address (`0.0.0.0` until it has one) and the target
 * version.
 */
export function buildHelmEnv(
  state: Pick<RunState, "plan">,
  entryIp: string | null
): Record<string, string> {
  return {
    ...imageEnvOf(state.plan.images),
    PERFKIT_ENTRY_IP: entryIp ?? "0.0.0.0",
    PERFKIT_TARGET_VERSION: state.plan.targetVersion
  };
}
