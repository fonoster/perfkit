/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { SCHEMA_IDS, type SchemaId } from "../schemas/index.js";

const KNOWN = Object.values(SCHEMA_IDS).join(", ");

export type DetectedFormat =
  { ok: true; format: SchemaId } | { ok: false; message: string };

/**
 * Tells the formats apart: perfkit.yaml by `apiVersion`, report.json and
 * runs.json by `schema`. Anything else is an unknown schema.
 */
export function detectFormat(document: unknown): DetectedFormat {
  const record =
    typeof document === "object" &&
    document !== null &&
    !Array.isArray(document)
      ? (document as Record<string, unknown>)
      : {};
  if ("apiVersion" in record) {
    return record.apiVersion === SCHEMA_IDS.config
      ? { ok: true, format: SCHEMA_IDS.config }
      : unknown(record.apiVersion);
  }
  if ("schema" in record) {
    return record.schema === SCHEMA_IDS.report ||
      record.schema === SCHEMA_IDS.runs
      ? { ok: true, format: record.schema }
      : unknown(record.schema);
  }
  return {
    ok: false,
    message: `no apiVersion or schema field; this perfkit reads ${KNOWN}`
  };
}

function unknown(value: unknown): DetectedFormat {
  return {
    ok: false,
    message: `unknown schema ${JSON.stringify(value) ?? String(value)}; this perfkit reads ${KNOWN}`
  };
}
