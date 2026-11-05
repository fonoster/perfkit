/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />
/**
 * The browser app, bundled into `app/<version>/app.js`. The shell loads it
 * with `defer`; it reads which run to draw from the page's URL, fetches
 * the data next to it and replaces the shell with the page. The latest page
 * also polls the project's live.json every 15 seconds and shows a run in
 * progress live; a run page never does.
 */
import { LIVE_INTERVAL_S, runsSchema } from "../../schemas/index.js";
import { createDrawRun } from "./createDrawRun.js";
import { createLiveController } from "./createLiveController.js";
import { createLiveDomView } from "./createLiveDomView.js";
import { mountPage } from "./mountPage.js";
import { resolveLiveUrl } from "./resolveLiveUrl.js";
import { resolveRunPath } from "./resolveRunPath.js";
import { showErrors } from "./showErrors.js";
import { SITE_PATHS } from "./sitePaths.js";
import { toSitePath } from "./toSitePath.js";

declare const __PERFKIT_VERSION__: string;

const scriptUrl =
  document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : location.href;
const root = new URL("../../", scriptUrl);
const path = toSitePath(location.href, scriptUrl);

const fetchText = async (file: string) => {
  const response = await fetch(new URL(file, root), { cache: "no-cache" });
  return { status: response.status, text: await response.text() };
};

const drawRun = createDrawRun({ version: __PERFKIT_VERSION__, fetchText });

const draw = async (sitePath: string) => {
  const result = await drawRun({ path: sitePath }).catch((err: unknown) => ({
    ok: false as const,
    errors: [err instanceof Error ? err.message : String(err)]
  }));
  if (result.ok) mountPage(document, result.html);
  else showErrors(document, result.errors);
  return result;
};

const goLive = (liveUrl: string, sitePath: string) => {
  const dom = createLiveDomView(document);
  const controller = createLiveController({
    liveUrl,
    version: __PERFKIT_VERSION__,
    fetchLive: async (url) => {
      const response = await fetch(url, {
        cache: "no-store",
        // ngrok's free domains answer browsers with a warning page without it.
        headers: { "ngrok-skip-browser-warning": "1" }
      });
      return { status: response.status, text: await response.text() };
    },
    fetchRuns: async () => {
      const response = await fetchText(SITE_PATHS.runs);
      if (response.status !== 200) return null;
      const parsed = runsSchema.safeParse(JSON.parse(response.text));
      return parsed.success ? parsed.data.runs : null;
    },
    view: {
      showLive: dom.showLive,
      tick: dom.tick,
      showFinal: async () => {
        await draw(sitePath);
      }
    },
    now: () => Date.now()
  });
  const loop = () => {
    controller.poll().finally(() => {
      setTimeout(loop, LIVE_INTERVAL_S * 1000);
    });
  };
  loop();
  setInterval(controller.tick, 1000);
};

if (path === null) {
  showErrors(document, [`perfkit: ${location.href} is outside the site`]);
} else {
  draw(path).then((result) => {
    if (resolveRunPath(path)?.page !== "latest") return;
    const liveUrl = resolveLiveUrl(
      location.href,
      result.ok ? result.liveUrl : null
    );
    if (liveUrl) goLive(liveUrl, path);
  });
}
