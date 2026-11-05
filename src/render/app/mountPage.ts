/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />

/**
 * Replaces the shell with a whole page: the page's `<html>` takes the
 * shell's place, so the document ends up as if the page had been loaded
 * itself. Parsed scripts never run, so each is put back as a new script,
 * which the browser runs once.
 */
export function mountPage(doc: Document, html: string): void {
  const parser = new (doc.defaultView ?? window).DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const scripts = Array.from(parsed.querySelectorAll("script")).map(
    (script) => {
      const marker = parsed.createComment("");
      script.replaceWith(marker);
      return { script, marker };
    }
  );
  const root = doc.adoptNode(parsed.documentElement);
  doc.replaceChild(root, doc.documentElement);
  scripts.forEach(({ script, marker }) => {
    const fresh = doc.createElement("script");
    Array.from(script.attributes).forEach(({ name, value }) =>
      fresh.setAttribute(name, value)
    );
    fresh.textContent = script.textContent;
    marker.replaceWith(fresh);
  });
}
