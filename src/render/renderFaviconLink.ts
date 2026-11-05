/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * The page head's icon link for `project.faviconSvg`, as a URL-encoded data
 * URI and ending in a newline, or an empty string without a favicon, so a
 * page without one is unchanged.
 */
export function renderFaviconLink(faviconSvg: string | undefined): string {
  return faviconSvg
    ? `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(faviconSvg)}">\n`
    : "";
}
