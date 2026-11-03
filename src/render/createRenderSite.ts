/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { join } from "node:path";
import { toFieldErrors } from "../errors/toFieldErrors.js";
import { withErrorHandlingAndValidation } from "../errors/withErrorHandlingAndValidation.js";
import {
  reportSchema,
  type Runs,
  runsSchema,
  SCHEMA_IDS
} from "../schemas/index.js";
import { createValidateFile } from "../validate/createValidateFile.js";
import { parseDocument } from "../validate/parseDocument.js";
import { mergeRuns } from "./mergeRuns.js";
import { renderRunPage } from "./renderRunPage.js";
import {
  type RenderSiteInput,
  renderSiteInputSchema
} from "./renderSite.schema.js";
import { toRunEntry } from "./toRunEntry.js";
import type {
  PageContext,
  RenderSiteDeps,
  RenderSiteResult,
  WrittenFile
} from "./types.js";

export const NO_HISTORY_WARNING =
  "perfkit: no history: first run, deltas omitted";

type History =
  { ok: true; runs: Runs | null } | Extract<RenderSiteResult, { ok: false }>;

/**
 * Creates the function behind `perfkit render`: it validates a report.json,
 * reads the history (a runs.json file or https URL; a 404 is no history),
 * and writes the static site: `runs/<id>/index.html`, `runs/<id>/report.json`,
 * `runs.json` and, when this run is the newest, `index.html`. Older run pages
 * are never touched.
 *
 * @param deps - File system, network and version (injected)
 * @returns A validated function that returns the files written, or the
 *   error lines and exit code (2 invalid input, 3 history fetch failed)
 */
export function createRenderSite(deps: RenderSiteDeps) {
  const validateFile = createValidateFile(deps);

  const fn = async ({
    report: reportFile,
    history: historySource,
    out
  }: RenderSiteInput): Promise<RenderSiteResult> => {
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

    const entry = toRunEntry(report);
    const merged = mergeRuns(history.runs, entry, report.project.name);
    const isLatest = merged.runs[0]?.id === entry.id;
    const page = (kind: PageContext["page"]) =>
      renderRunPage({
        report,
        runs: merged.runs,
        current: entry,
        page: kind,
        base: kind === "latest" ? "" : "../../",
        perfkitVersion: deps.version
      });

    const runDir = join(out, "runs", report.run.id);
    const files: Array<WrittenFile & { text: string }> = [
      ...(isLatest
        ? [
            {
              path: join(out, "index.html"),
              note: `latest: ${report.run.id}`,
              text: page("latest")
            }
          ]
        : []),
      { path: join(runDir, "index.html"), note: null, text: page("run") },
      { path: join(runDir, "report.json"), note: null, text: reportText },
      {
        path: join(out, "runs.json"),
        note: `${merged.runs.length} run${merged.runs.length === 1 ? "" : "s"}`,
        text: `${JSON.stringify(merged, null, 2)}\n`
      }
    ];
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
  };

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
