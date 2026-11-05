/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8"
};

/** The Content-Type of a site file by its extension. */
export function contentTypeOf(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}
