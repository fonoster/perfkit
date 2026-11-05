/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { dirname, join } from "node:path";
import { toFieldErrors } from "../errors/toFieldErrors.js";
import { withErrorHandlingAndValidation } from "../errors/withErrorHandlingAndValidation.js";
import {
  projectFromConfig,
  type Report,
  reportSchema,
  type RunEntry,
  type Runs,
  runsSchema,
  SCHEMA_IDS,
  SITE_SCHEMA_ID,
  type Site
} from "../schemas/index.js";
import { createLoadConfig } from "../validate/createLoadConfig.js";
import { createValidateFile } from "../validate/createValidateFile.js";
import { parseDocument } from "../validate/parseDocument.js";
import { SITE_PATHS } from "./app/sitePaths.js";
import { mergeRuns } from "./mergeRuns.js";
import { renderShell } from "./renderShell.js";
import {
  type RenderSiteInput,
  renderSiteInputSchema
} from "./renderSite.schema.js";
import { toRunEntry } from "./toRunEntry.js";
import type {
  PageKind,
  RenderSiteDeps,
  RenderSiteResult,
  WrittenFile
} from "./types.js";

export const NO_HISTORY_WARNING =
  "perfkit: no history: first run, deltas omitted";

type History =
  { ok: true; runs: Runs | null } | Extract<RenderSiteResult, { ok: false }>;

type SiteFile = WrittenFile & { text: string };

/**
 * Creates the function behind `perfkit render`: it validates a report.json,
 * reads the history (a runs.json file or https URL; a 404 is no history),
 * and writes the data-driven site: this perfkit's browser app
 * (`app/<version>/app.js`), this run's report (`data/runs/<id>/report.json`,
 * and a copy in `runs/<id>/` for the page's report.json link), the history
 * (`data/runs.json`), the project (`data/site.json`: its name, branding and
 * live.json URL), and the shells (`index.html` and one
 * `runs/<id>/index.html` per run in the history), which load the app and
 * carry this report's favicon, so the tab has its icon before the app draws. The
 * app draws each page from the data when it is viewed, so older reports are
 * never read or rewritten, and a new perfkit redraws every run.
 *
 * With `config` instead of `report` it adds no run: the project comes from
 * perfkit.yaml (logo and favicon inlined) and the history is written as it
 * is, empty without `history`. A project can so publish its site, and show
 * a run in progress live, before its first run is published.
 *
 * @param deps - File system, network and version (injected)
 * @returns A validated function that returns the files written, or the
 *   error lines and exit code (2 invalid input, 3 history fetch failed)
 */
export function createRenderSite(deps: RenderSiteDeps) {
  const validateFile = createValidateFile(deps);
  const loadConfig = createLoadConfig(deps);

  const fn = async (input: RenderSiteInput): Promise<RenderSiteResult> =>
    input.report === undefined
      ? renderFromConfig(input.config ?? "", input.history, input.out)
      : renderReport(input.report, input.history, input.out);

  async function renderReport(
    reportFile: string,
    historySource: string | undefined,
    out: string
  ): Promise<RenderSiteResult> {
    const checked = await validateFile({ file: reportFile });
    if (!checked.valid) {
      return {
        ok: false,
        exitCode: 2,
        errors: lines(reportFile, checked.errors)
      };
    }
    if (checked.format !== SCHEMA_IDS.report) {
      return {
        ok: false,
        exitCode: 2,
        errors: [
          `${reportFile}: expected a ${SCHEMA_IDS.report} report; got ${checked.format}`
        ]
      };
    }
    const reportText = await deps.readFile(reportFile);
    const report = reportSchema.parse(parseDocument(reportText, reportFile));

    const history = await readHistory(historySource);
    if (!history.ok) return history;
    const warnings = history.runs === null ? [NO_HISTORY_WARNING] : [];

    const merged = mergeRuns(
      history.runs,
      toRunEntry(report),
      report.project.name
    );
    const at = (path: string) => join(out, ...path.split("/"));
    return writeSite(
      [
        await appFile(out),
        {
          path: at(SITE_PATHS.report(report.run.id)),
          note: null,
          text: reportText
        },
        {
          path: at(`${SITE_PATHS.runDir(report.run.id)}report.json`),
          note: null,
          text: reportText
        },
        ...siteFiles(out, report.project, merged)
      ],
      warnings
    );
  }

  async function renderFromConfig(
    configFile: string,
    historySource: string | undefined,
    out: string
  ): Promise<RenderSiteResult> {
    const loaded = await loadConfig({ file: configFile });
    if (!loaded.ok) {
      return {
        ok: false,
        exitCode: 2,
        errors: lines(configFile, loaded.errors)
      };
    }
    const { config } = loaded;
    const inline = async (file: string | undefined) =>
      file === undefined
        ? undefined
        : (await deps.readFile(join(dirname(configFile), file))).trim();
    const logoSvg = await inline(config.project.logo);
    const faviconSvg = await inline(config.project.favicon);
    const project = projectFromConfig(config, {
      ...(logoSvg ? { logoSvg } : {}),
      ...(faviconSvg ? { faviconSvg } : {})
    });

    const history = await readHistory(historySource);
    if (!history.ok) return history;
    const runs: Runs = history.runs ?? {
      schema: SCHEMA_IDS.runs,
      project: project.name,
      runs: []
    };
    return writeSite(
      [await appFile(out), ...siteFiles(out, project, runs)],
      []
    );
  }

  async function appFile(out: string): Promise<SiteFile> {
    return {
      path: join(out, ...SITE_PATHS.app(deps.version).split("/")),
      note: `perfkit ${deps.version}`,
      text: await deps.appBundle()
    };
  }

  /** The history, the project and the shells: what every render writes. */
  function siteFiles(
    out: string,
    project: Report["project"],
    runs: Runs
  ): SiteFile[] {
    const at = (path: string) => join(out, ...path.split("/"));
    const shell = (run: RunEntry | null, page: PageKind) =>
      renderShell({
        project: runs.project,
        run,
        page,
        perfkitVersion: deps.version,
        ...(project.faviconSvg ? { faviconSvg: project.faviconSvg } : {})
      });
    const site: Site = { schema: SITE_SCHEMA_ID, project };
    const newest = runs.runs[0] ?? null;
    return [
      {
        path: at(SITE_PATHS.runs),
        note: `${runs.runs.length} run${runs.runs.length === 1 ? "" : "s"}`,
        text: `${JSON.stringify(runs, null, 2)}\n`
      },
      {
        path: at(SITE_PATHS.site),
        note: project.live ? `live: ${project.live.url}` : "no live URL",
        text: `${JSON.stringify(site, null, 2)}\n`
      },
      {
        path: at("index.html"),
        note: newest ? `latest: ${newest.id}` : "no runs yet",
        text: shell(newest, "latest")
      },
      ...runs.runs.map((run) => ({
        path: at(`${SITE_PATHS.runDir(run.id)}index.html`),
        note: null,
        text: shell(run, "run")
      }))
    ];
  }

  async function writeSite(
    files: SiteFile[],
    warnings: string[]
  ): Promise<RenderSiteResult> {
    await files.reduce(
      (previous, file) =>
        previous.then(() => deps.writeFile(file.path, file.text)),
      Promise.resolve()
    );
    return {
      ok: true,
      written: files.map(({ path, note }) => ({ path, note })),
      warnings
    };
  }

  async function readHistory(source: string | undefined): Promise<History> {
    if (source === undefined) return { ok: true, runs: null };
    if (/^https:\/\//i.test(source)) {
      const response = await deps
        .fetchText(source)
        .catch((err: unknown) =>
          err instanceof Error ? err : new Error(String(err))
        );
      if (response instanceof Error) {
        return {
          ok: false,
          exitCode: 3,
          errors: [`perfkit: cannot fetch ${source}: ${response.message}`]
        };
      }
      if (response.status === 404) return { ok: true, runs: null };
      if (response.status < 200 || response.status > 299) {
        return {
          ok: false,
          exitCode: 3,
          errors: [`perfkit: cannot fetch ${source}: HTTP ${response.status}`]
        };
      }
      return parseRuns(source, () => JSON.parse(response.text));
    }
    const checked = await validateFile({ file: source });
    if (!checked.valid) {
      return { ok: false, exitCode: 2, errors: lines(source, checked.errors) };
    }
    if (checked.format !== SCHEMA_IDS.runs) {
      return {
        ok: false,
        exitCode: 2,
        errors: [
          `${source}: expected a ${SCHEMA_IDS.runs} index; got ${checked.format}`
        ]
      };
    }
    const text = await deps.readFile(source);
    return parseRuns(source, () => parseDocument(text, source));
  }

  return withErrorHandlingAndValidation(fn, renderSiteInputSchema);
}

function parseRuns(source: string, read: () => unknown): History {
  let document: unknown;
  try {
    document = read();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      exitCode: 2,
      errors: [`${source}: cannot parse: ${message.split("\n")[0]}`]
    };
  }
  const result = runsSchema.safeParse(document, { reportInput: true });
  if (!result.success) {
    return {
      ok: false,
      exitCode: 2,
      errors: lines(
        source,
        toFieldErrors(result.error.issues).map(({ field, message }) => ({
          path: field,
          message
        }))
      )
    };
  }
  return { ok: true, runs: result.data };
}

function lines(
  file: string,
  errors: ReadonlyArray<{ path: string | null; message: string }>
): string[] {
  return errors.map(({ path, message }) =>
    path === null ? `${file}: ${message}` : `${file}: ${path}: ${message}`
  );
}
