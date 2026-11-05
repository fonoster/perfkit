/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/// <reference lib="dom" />

/** Puts the error lines in the shell's body, in place of the page. */
export function showErrors(doc: Document, errors: string[]): void {
  const alert = doc.createElement("div");
  alert.setAttribute("role", "alert");
  const lead = doc.createElement("p");
  lead.textContent = "This benchmarks page could not be drawn.";
  const list = doc.createElement("pre");
  list.textContent = errors.join("\n");
  alert.append(lead, list);
  doc.body.replaceChildren(alert);
}
