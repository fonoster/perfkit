/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** Which page a URL path draws: the latest run, or one run by id. */
export type RunPath = { page: "latest" } | { page: "run"; id: string };

/**
 * Reads the page from a path relative to the site root: `` or
 * `index.html` is the latest run; `runs/<id>/` (with or without
 * `index.html`) is that run. Anything else is null.
 */
export function resolveRunPath(path: string): RunPath | null {
  if (path === "" || path === "index.html") return { page: "latest" };
  const match = /^runs\/([^/]+)\/(?:index\.html)?$/.exec(path);
  return match?.[1] ? { page: "run", id: match[1] } : null;
}
