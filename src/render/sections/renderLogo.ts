/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Report } from "../../schemas/index.js";
import { esc } from "../html.js";

/**
 * The project's logo from `project.logoSvg`, else its name. The SVG goes in
 * an `<img>` as a data URI, so markup in it never runs on the page.
 */
export function renderLogo(project: Report["project"]): string {
  return project.logoSvg
    ? `<img class="logo" src="data:image/svg+xml,${encodeURIComponent(project.logoSvg)}" alt="${esc(project.name)}" height="28">`
    : `<span class="logo-text">${esc(project.name)}</span>`;
}
