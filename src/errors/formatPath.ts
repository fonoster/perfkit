/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Formats a Zod issue path as a JSON path, like `benchmarks[1].verdict`.
 * Keys that are not identifiers are quoted: `images["my image"]`. The empty
 * path, the document itself, is `$`.
 */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((out, segment, index) => {
    if (typeof segment === "number") return `${out}[${segment}]`;
    const key = String(segment);
    if (!IDENTIFIER.test(key)) return `${out}[${JSON.stringify(key)}]`;
    return index === 0 ? key : `${out}.${key}`;
  }, "");
}
