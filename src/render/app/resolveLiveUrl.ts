/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The live.json URL the latest page polls: `?live=<url>` on the page (for
 * a local run, like `?live=http://localhost:8787/live.json`), else the
 * project's `live.url` from the latest report, else none. Only http and
 * https URLs count.
 */
export function resolveLiveUrl(
  pageUrl: string,
  fromReport: string | null
): string | null {
  const override = new URL(pageUrl).searchParams.get("live");
  const candidate = override ?? fromReport;
  if (!candidate) return null;
  try {
    const url = new URL(candidate, pageUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
