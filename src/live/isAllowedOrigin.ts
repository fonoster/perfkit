/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/**
 * Whether a page at `origin` may read live.json: the project's site (the
 * origin of `project.siteUrl`), or a page on this machine over http, for
 * `perfkit serve`.
 */
export function isAllowedOrigin(origin: string, siteUrl: string): boolean {
  if (LOCAL.test(origin)) return true;
  try {
    return new URL(siteUrl).origin === origin;
  } catch {
    return false;
  }
}
