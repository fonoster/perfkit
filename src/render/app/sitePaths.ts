/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Where the site keeps each file, relative to its root. The data files are
 * what a new run adds; the app and the shells are what an upgrade replaces.
 */
export const SITE_PATHS = {
  runs: "data/runs.json",
  /** The project: name, branding and live.json URL. */
  site: "data/site.json",
  report: (id: string) => `data/runs/${id}/report.json`,
  /** The run's page; also holds a copy of its report.json, for the page's link. */
  runDir: (id: string) => `runs/${id}/`,
  app: (version: string) => `app/${version}/app.js`
};
