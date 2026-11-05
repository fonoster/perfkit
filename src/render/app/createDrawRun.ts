/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { toFieldErrors } from "../../errors/toFieldErrors.js";
import { withErrorHandlingAndValidation } from "../../errors/withErrorHandlingAndValidation.js";
import { reportSchema, runsSchema } from "../../schemas/index.js";
import { renderRunPage } from "../renderRunPage.js";
import { toPageContext } from "../toPageContext.js";
import { type DrawRunInput, drawRunInputSchema } from "./drawRun.schema.js";
import { resolveRunPath } from "./resolveRunPath.js";
import { SITE_PATHS } from "./sitePaths.js";
import type { DrawRunDeps, DrawRunResult } from "./types.js";

type Fetched<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Creates the browser app's draw step: from the page's path it picks the run,
 * fetches `data/runs.json` and the run's report.json, validates both with
 * the same schemas as `perfkit validate`, and returns the page HTML that
 * `perfkit render` used to write, from the same renderer. A report missing
 * from `data/runs/<id>/` is read from `runs/<id>/report.json`, where
 * sites rendered before the app kept it.
 *
 * @param deps - The app's version and a fetch relative to the site root
 * @returns A validated function that returns the page HTML, or error lines
 */
export function createDrawRun(deps: DrawRunDeps) {
  const fn = async ({ path }: DrawRunInput): Promise<DrawRunResult> => {
    const target = resolveRunPath(path);
    if (target === null) {
      return { ok: false, errors: [`perfkit: no run page at ${path}`] };
    }
    const runs = await fetchValid(SITE_PATHS.runs, runsSchema);
    if (!runs.ok) return runs;
    const current =
      target.page === "latest"
        ? runs.value.runs[0]
        : runs.value.runs.find((run) => run.id === target.id);
    if (current === undefined) {
      return {
        ok: false,
        errors: [
          target.page === "latest"
            ? `${SITE_PATHS.runs}: no runs yet`
            : `${SITE_PATHS.runs}: no run ${target.id}`
        ]
      };
    }
    const report = await fetchValid(
      SITE_PATHS.report(current.id),
      reportSchema,
      `${current.path}report.json`
    );
    if (!report.ok) return report;
    const html = renderRunPage(
      toPageContext({
        report: report.value,
        runs: runs.value.runs,
        current,
        page: target.page,
        perfkitVersion: deps.version
      })
    );
    return { ok: true, runId: current.id, html };
  };

  async function fetchValid<T extends z.ZodType>(
    path: string,
    schema: T,
    fallback?: string
  ): Promise<Fetched<z.infer<T>>> {
    const response = await deps
      .fetchText(path)
      .catch((err: unknown) =>
        err instanceof Error ? err : new Error(String(err))
      );
    if (response instanceof Error) {
      return {
        ok: false,
        errors: [`${path}: cannot fetch: ${response.message}`]
      };
    }
    if (response.status === 404 && fallback !== undefined) {
      return fetchValid(fallback, schema);
    }
    if (response.status < 200 || response.status > 299) {
      return {
        ok: false,
        errors: [`${path}: cannot fetch: HTTP ${response.status}`]
      };
    }
    let document: unknown;
    try {
      document = JSON.parse(response.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errors: [`${path}: cannot parse: ${message}`] };
    }
    const result = schema.safeParse(document, { reportInput: true });
    if (!result.success) {
      return {
        ok: false,
        errors: toFieldErrors(result.error.issues).map(
          ({ field, message }) => `${path}: ${field}: ${message}`
        )
      };
    }
    return { ok: true, value: result.data };
  }

  return withErrorHandlingAndValidation(fn, drawRunInputSchema);
}
