/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { projectFromConfig } from "../schemas/projectFromConfig.js";
import type { Report } from "../schemas/index.js";
import type { RunState } from "./runState.schema.js";

/**
 * The project as report.json and live.json carry it, from perfkit.yaml. Its
 * live URL is `project.live.url`, else `live.url`, else the live.json of the static ngrok
 * domain in `live.domain`, else there is none.
 */
export function toReportProject(state: RunState): Report["project"] {
  return projectFromConfig(state.config, {
    ...(state.logoSvg ? { logoSvg: state.logoSvg } : {}),
    ...(state.faviconSvg ? { faviconSvg: state.faviconSvg } : {})
  });
}
