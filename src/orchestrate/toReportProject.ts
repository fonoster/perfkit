/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Report } from "../schemas/index.js";
import type { RunState } from "./runState.schema.js";

/**
 * The project as report.json and live.json carry it, from perfkit.yaml. Its
 * live URL is `project.live.url`, else `live.url`, else the live.json of the static ngrok
 * domain in `live.domain`, else there is none.
 */
export function toReportProject(state: RunState): Report["project"] {
  const { project, live } = state.config;
  const liveUrl =
    project.live?.url ??
    live?.url ??
    (live?.domain ? `https://${live.domain}/live.json` : null);
  return {
    name: project.name,
    repo: project.repo,
    siteUrl: project.siteUrl,
    accent: project.accent,
    ...(state.logoSvg ? { logoSvg: state.logoSvg } : {}),
    ...(state.faviconSvg ? { faviconSvg: state.faviconSvg } : {}),
    title: project.title,
    lead: project.lead,
    ...(liveUrl ? { live: { url: liveUrl } } : {})
  };
}
