/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Report, RunEntry } from "../schemas/index.js";
import type { PageContext, PageKind } from "./types.js";

/**
 * The context one page is drawn from: `/benchmarks/` sits at the site root
 * and `runs/<id>/` two levels below it, so its links climb `../../`.
 */
export function toPageContext(params: {
  report: Report;
  runs: RunEntry[];
  current: RunEntry;
  page: PageKind;
  perfkitVersion: string;
}): PageContext {
  return { ...params, base: params.page === "latest" ? "" : "../../" };
}
