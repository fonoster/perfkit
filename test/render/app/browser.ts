/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Opens a page of a site rendered in memory the way a browser would: jsdom
 * loads the shell from its URL, runs the real app bundle it points at, and
 * answers the app's fetches from the written files. Nothing reaches the
 * network: a request outside the site answers an empty 200.
 */
import { JSDOM, requestInterceptor, VirtualConsole } from "jsdom";
import { join } from "node:path";
import { bundleApp } from "../../../src/render/app/bundleApp.js";
import { createRenderSite } from "../../../src/render/createRenderSite.js";
import { renderRunPage } from "../../../src/render/renderRunPage.js";
import { toPageContext } from "../../../src/render/toPageContext.js";
import { reportSchema, runsSchema } from "../../../src/schemas/index.js";
import type { Json } from "../../fixtures.js";
import { makeDeps } from "../site.js";

export const SITE = "https://perfkit.test/benchmarks/";

let bundle: Promise<string> | null = null;

/** The real app, bundled once per test run, for perfkit 9.8.7. */
export function realApp(): Promise<string> {
  bundle ??= bundleApp("9.8.7");
  return bundle;
}

function serve(written: Map<string, string>, out: string, url: string) {
  if (!url.startsWith(SITE)) return { status: 200, text: "" };
  const path = new URL(url).pathname.slice(new URL(SITE).pathname.length);
  const file = path === "" || path.endsWith("/") ? `${path}index.html` : path;
  const text = written.get(join(out, ...file.split("/")));
  return text === undefined
    ? { status: 404, text: "Not Found" }
    : { status: 200, text };
}

/**
 * Loads `path` (relative to the site, like `runs/<id>/`) and waits until
 * the app has drawn the page or its errors.
 */
export async function openPage(
  written: Map<string, string>,
  out: string,
  path: string
) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  virtualConsole.on("error", (...args) => errors.push(args.join(" ")));
  const shell = serve(written, out, SITE + path);
  if (shell.status !== 200) throw new Error(`no shell at ${path}`);
  const dom = new JSDOM(shell.text, {
    url: SITE + path,
    runScripts: "dangerously",
    virtualConsole,
    resources: {
      interceptors: [
        requestInterceptor((request) => {
          const { status, text } = serve(written, out, request.url);
          return new Response(text, { status });
        })
      ]
    },
    beforeParse(window) {
      Object.assign(window, {
        fetch: async (input: string | URL) => {
          const { status, text } = serve(written, out, String(input));
          return new Response(text, { status });
        }
      });
    }
  });
  const { document } = dom.window;
  const drawn = () =>
    document.querySelector("main") ?? document.querySelector("[role=alert]");
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (drawn()) return resolve();
      if (Date.now() - started > 1500) {
        return reject(new Error(`${path}: not drawn: ${errors.join("; ")}`));
      }
      setTimeout(check, 5);
    };
    check();
  });
  return { dom, document, errors };
}

/** How a browser parses a whole page, to compare documents node for node. */
export function parsePage(html: string): string {
  return new JSDOM(html).window.document.documentElement.outerHTML;
}

/** Renders a report with the real app bundle; history in memory. */
export async function renderWithApp(report: Json, history: Json | null) {
  const memory: Record<string, Json> = { "report.json": report };
  if (history !== null) memory["runs.json"] = history;
  const { deps, written } = makeDeps(memory, undefined, realApp);
  const result = await createRenderSite(deps)({
    report: "report.json",
    ...(history === null ? {} : { history: "runs.json" }),
    out: "out"
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return written;
}

/** What `perfkit render` wrote as the page before the app. */
export function expectedPage(
  written: Map<string, string>,
  report: Json,
  page: "latest" | "run"
): string {
  const runs = runsSchema.parse(
    JSON.parse(written.get(join("out", "data", "runs.json")) ?? "null")
  );
  const current = runs.runs.find((run) => run.id === report.run.id);
  if (current === undefined) throw new Error("run not in data/runs.json");
  return renderRunPage(
    toPageContext({
      report: reportSchema.parse(report),
      runs: runs.runs,
      current,
      page,
      perfkitVersion: "9.8.7"
    })
  );
}
