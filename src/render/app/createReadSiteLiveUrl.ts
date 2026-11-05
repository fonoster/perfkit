/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { siteSchema } from "../../schemas/index.js";
import { SITE_PATHS } from "./sitePaths.js";
import type { DrawRunDeps } from "./types.js";

/**
 * Creates the app's read of the project's live.json URL from
 * `data/site.json`. A site rendered before site.json existed, or an invalid
 * or unreachable one, has none: the app then falls back to the latest
 * report's.
 *
 * @param deps - A fetch relative to the site root
 * @returns A function that returns the URL or null; it never rejects
 */
export function createReadSiteLiveUrl(deps: Pick<DrawRunDeps, "fetchText">) {
  return async (): Promise<string | null> => {
    try {
      const response = await deps.fetchText(SITE_PATHS.site);
      if (response.status !== 200) return null;
      const parsed = siteSchema.safeParse(JSON.parse(response.text));
      return parsed.success ? (parsed.data.project.live?.url ?? null) : null;
    } catch {
      return null;
    }
  };
}
