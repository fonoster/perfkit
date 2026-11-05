/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { posix } from "node:path";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  type LiveRequest,
  liveRequestSchema,
  type LiveResponse
} from "../live/handleLiveRequest.schema.js";
import { contentTypeOf } from "./contentTypeOf.js";

/**
 * Creates the request handler of `perfkit serve`: a read-only static
 * server for a rendered benchmarks site, as GitHub Pages serves it. A path
 * that ends in `/` serves its `index.html`; a directory without the
 * slash redirects to it; anything outside the site, missing, or not GET or
 * HEAD is 404. Nothing is cached, so a re-render shows at once.
 *
 * @param deps - Reads a site file by its path relative to the site root;
 *   null when it is missing or a directory (injected)
 */
export function createServeSite(deps: {
  readSiteFile: (path: string) => Promise<string | null>;
  isSiteDir: (path: string) => Promise<boolean>;
}) {
  const fn = async (request: LiveRequest): Promise<LiveResponse> => {
    const notFound = {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "not found\n"
    };
    if (request.method !== "GET" && request.method !== "HEAD") return notFound;
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://site").pathname
      );
    } catch {
      return notFound;
    }
    const normal = posix.normalize(pathname);
    if (!normal.startsWith("/") || normal.split("/").includes(".."))
      return notFound;
    const relative = normal.slice(1);
    if (
      relative !== "" &&
      !relative.endsWith("/") &&
      (await deps.isSiteDir(relative))
    ) {
      return { status: 301, headers: { Location: `${pathname}/` }, body: "" };
    }
    const file =
      relative === "" || relative.endsWith("/")
        ? `${relative}index.html`
        : relative;
    const text = await deps.readSiteFile(file).catch(() => null);
    if (text === null) return notFound;
    return {
      status: 200,
      headers: {
        "Content-Type": contentTypeOf(file),
        "Cache-Control": "no-cache"
      },
      body: request.method === "HEAD" ? "" : text
    };
  };
  return withErrorHandlingAndValidation(fn, liveRequestSchema);
}
