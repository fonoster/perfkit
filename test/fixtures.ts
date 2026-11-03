/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Loads the committed examples. Each call returns a fresh copy, so a test can
 * break one without affecting the others.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EXAMPLES = join(ROOT, "examples");
export const ROUTR_CONFIG = join(EXAMPLES, "routr", "perfkit.yaml");
export const REPORT_FORMS = [
  "passed",
  "failed",
  "first-run",
  "not-run"
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export function loadConfig(): Json {
  return parse(readFileSync(ROUTR_CONFIG, "utf8"));
}

export function loadReport(form: (typeof REPORT_FORMS)[number]): Json {
  return JSON.parse(
    readFileSync(join(EXAMPLES, "reports", `${form}.json`), "utf8")
  );
}

export function loadRuns(): Json {
  return JSON.parse(readFileSync(join(EXAMPLES, "runs.json"), "utf8"));
}
