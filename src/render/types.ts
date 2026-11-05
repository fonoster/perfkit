/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type {
  CapacityBenchmarkResult,
  Report,
  RunEntry,
  SoakBenchmarkResult
} from "../schemas/index.js";

/** `latest` is `/benchmarks/index.html`; `run` is `runs/<id>/index.html`. */
export type PageKind = "latest" | "run";

/** Everything one page is rendered from. */
export interface PageContext {
  report: Report;
  /** The history with this run in it, newest first. */
  runs: RunEntry[];
  /** This run's entry in `runs`. */
  current: RunEntry;
  page: PageKind;
  /** The path from this page to the site root: `` or `../../`. */
  base: string;
  /** The perfkit version that renders the page. */
  perfkitVersion: string;
}

export type MeasuredCapacity = Extract<
  CapacityBenchmarkResult,
  { verdict: "passed" | "failed" }
>;
export type PartialCapacity = Extract<
  CapacityBenchmarkResult,
  { verdict: "inconclusive" | "aborted" }
>;
export type MeasuredSoak = Extract<
  SoakBenchmarkResult,
  { verdict: "passed" | "failed" }
>;
export type PartialSoak = Extract<
  SoakBenchmarkResult,
  { verdict: "inconclusive" | "aborted" }
>;

/** What `perfkit render` needs from the outside world, injected. */
export interface RenderSiteDeps {
  /** The perfkit version: the app's folder and the footer. */
  version: string;
  /** The browser app's script, bundled for this version. */
  appBundle: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  /** True when the path exists and is a file. */
  isFile: (path: string) => Promise<boolean>;
  /** Writes a file, creating its directories. */
  writeFile: (path: string, text: string) => Promise<void>;
  /** Fetches an https URL; rejects on a network error. */
  fetchText: (url: string) => Promise<{ status: number; text: string }>;
}

/** One file written, as the CLI reports it. */
export interface WrittenFile {
  path: string;
  /** `latest: <id>`, `15 runs`, `perfkit <version>` */
  note: string | null;
}

export type RenderSiteResult =
  | { ok: true; written: WrittenFile[]; warnings: string[] }
  | { ok: false; exitCode: 2 | 3; errors: string[] };
