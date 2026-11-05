/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />
import { formatUpdated } from "../live/formatUpdated.js";
import { renderLivePage } from "../live/renderLivePage.js";
import { renderLiveView } from "../live/renderLiveView.js";
import type { LiveViewContext } from "../live/types.js";
import { mountPage } from "./mountPage.js";

/**
 * The live view in a document: the first draw of a run mounts the whole
 * page; later draws replace the banner, main and footer in place, keeping
 * the scroll position and every open "Numbers behind this chart", so the
 * page can be read while it updates. `tick` only rewrites "updated N s
 * ago".
 */
export function createLiveDomView(doc: Document) {
  const showLive = (ctx: LiveViewContext, first: boolean) => {
    const main = doc.getElementById("live-main");
    if (first || !main) {
      mountPage(doc, renderLivePage(ctx));
      return;
    }
    const parts = renderLiveView(ctx);
    const win = doc.defaultView;
    const y = win?.scrollY ?? 0;
    const open = Array.from(main.querySelectorAll("details")).map(
      (d) => d.open
    );
    const set = (id: string, html: string) => {
      const el = doc.getElementById(id);
      if (el) el.innerHTML = html;
    };
    set("live-banner", parts.banner);
    main.innerHTML = parts.main;
    set("live-footer", parts.footer);
    Array.from(main.querySelectorAll("details")).forEach((d, i) => {
      if (open[i]) d.open = true;
    });
    if (win && win.scrollY !== y) win.scrollTo(0, y);
  };

  const tick = (ctx: LiveViewContext) => {
    const el = doc.querySelector("[data-updated]");
    if (!el) return;
    const updated = formatUpdated(
      ctx.live.updatedAt,
      ctx.nowMs,
      ctx.connection
    );
    if (el.textContent !== updated.text) el.textContent = updated.text;
    el.className = `updated is-${updated.tone}`;
  };

  return { showLive, tick };
}
