/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { HelmUutConfig, UutConfig } from "./perfkitConfig.schema.js";

/** True when the unit under test is a Helm chart on the cluster. */
export function isHelmUut(uut: UutConfig): uut is HelmUutConfig {
  return "helm" in uut;
}
