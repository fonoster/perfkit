/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { PerfkitConfig } from "./perfkitConfig.schema.js";
import type { Report } from "./report.schema.js";

/**
 * The project as report.json, live.json and site.json carry it, from
 * perfkit.yaml and its inlined logo and favicon. Its live URL is
 * `project.live.url`, else `live.url`, else the live.json of the static
 * ngrok domain in `live.domain`, else there is none.
 */
export function projectFromConfig(
  config: Pick<PerfkitConfig, "project" | "live">,
  svgs: { logoSvg?: string; faviconSvg?: string } = {}
): Report["project"] {
  const { project, live } = config;
  const liveUrl =
    project.live?.url ??
    live?.url ??
    (live?.domain ? `https://${live.domain}/live.json` : null);
  return {
    name: project.name,
    repo: project.repo,
    siteUrl: project.siteUrl,
    accent: project.accent,
    ...(svgs.logoSvg ? { logoSvg: svgs.logoSvg } : {}),
    ...(svgs.faviconSvg ? { faviconSvg: svgs.faviconSvg } : {}),
    title: project.title,
    lead: project.lead,
    ...(liveUrl ? { live: { url: liveUrl } } : {})
  };
}
