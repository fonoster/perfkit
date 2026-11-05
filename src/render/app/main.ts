/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />
/**
 * The browser app, bundled into `app/<version>/app.js`. The shell loads it
 * with `defer`; it reads which run to draw from the page's URL, fetches
 * the data next to it and replaces the shell with the page.
 */
import { createDrawRun } from "./createDrawRun.js";
import { mountPage } from "./mountPage.js";
import { showErrors } from "./showErrors.js";
import { toSitePath } from "./toSitePath.js";

declare const __PERFKIT_VERSION__: string;

const scriptUrl =
  document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : location.href;
const root = new URL("../../", scriptUrl);
const path = toSitePath(location.href, scriptUrl);

const drawRun = createDrawRun({
  version: __PERFKIT_VERSION__,
  fetchText: async (file) => {
    const response = await fetch(new URL(file, root), { cache: "no-cache" });
    return { status: response.status, text: await response.text() };
  }
});

if (path === null) {
  showErrors(document, [`perfkit: ${location.href} is outside the site`]);
} else {
  drawRun({ path })
    .then((result) =>
      result.ok
        ? mountPage(document, result.html)
        : showErrors(document, result.errors)
    )
    .catch((err: unknown) =>
      showErrors(document, [err instanceof Error ? err.message : String(err)])
    );
}
