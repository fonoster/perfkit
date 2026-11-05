/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The page's path relative to the site root, which is two levels above the
 * app's own script (`app/<version>/app.js`): `` for the root, like
 * `runs/<id>/` for a run. A page outside the root is null.
 */
export function toSitePath(pageUrl: string, scriptUrl: string): string | null {
  const root = new URL("../../", scriptUrl);
  const page = new URL(pageUrl);
  if (page.origin !== root.origin) return null;
  if (!page.pathname.startsWith(root.pathname)) return null;
  return decodeURIComponent(page.pathname.slice(root.pathname.length));
}
