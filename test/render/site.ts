/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Renders the site in memory: inputs are served from `memory` (by the exact
 * path given) or read from disk, and every write lands in `written`.
 */
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli/runCli.js";
import { createRenderSite } from "../../src/render/createRenderSite.js";
import type { RenderSiteDeps } from "../../src/render/types.js";
import { EXAMPLES, type Json } from "../fixtures.js";
import { infraDeps } from "../infra/fakes.js";

export const RUNS_4 = join(EXAMPLES, "runs.json");
export const RUNS_14 = join(EXAMPLES, "history", "runs-14.json");

export function loadHistory(file: string): Json {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function makeDeps(
  memory: Record<string, Json> = {},
  fetchText: RenderSiteDeps["fetchText"] = async () => {
    throw new Error("no network in unit tests");
  }
) {
  const written = new Map<string, string>();
  const text = (value: Json) =>
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const deps: RenderSiteDeps = {
    version: "9.8.7",
    readFile: async (path) =>
      path in memory ? text(memory[path]) : readFile(path, "utf8"),
    isFile: async (path) =>
      path in memory ||
      stat(path).then(
        (s) => s.isFile(),
        () => false
      ),
    writeFile: async (path, value) => {
      written.set(path, value);
    },
    fetchText
  };
  return { deps, written };
}

/** Renders a report object, with an optional history object. */
export async function renderSite(report: Json, history: Json | null = null) {
  const memory: Record<string, Json> = { "report.json": report };
  if (history !== null) memory["runs.json"] = history;
  const { deps, written } = makeDeps(memory);
  const result = await createRenderSite(deps)({
    report: "report.json",
    ...(history === null ? {} : { history: "runs.json" }),
    out: "out"
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  const page = (path: string) => {
    const html = written.get(join("out", path));
    if (html === undefined) throw new Error(`not written: ${path}`);
    return load(html);
  };
  return {
    result,
    written,
    latest: () => page("index.html"),
    runPage: () => page(join("runs", report.run.id, "index.html")),
    runs: () => JSON.parse(written.get(join("out", "runs.json")) ?? "null")
  };
}

/** Runs the CLI in process with in-memory files. */
export async function runRender(
  args: string[],
  memory: Record<string, Json> = {},
  fetchText?: RenderSiteDeps["fetchText"]
) {
  const out: string[] = [];
  const err: string[] = [];
  const { deps, written } = makeDeps(memory, fetchText);
  const code = await runCli(["node", "perfkit", ...args], {
    ...deps,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    infra: infraDeps()
  });
  return { code, out: out.join(""), err: err.join(""), written };
}

/** The page's visible text with whitespace collapsed. */
export function textOf($: ReturnType<typeof load>, selector = "body"): string {
  const node = $(selector).clone();
  node.find("script, style").remove();
  return node.text().replace(/\s+/g, " ").trim();
}
