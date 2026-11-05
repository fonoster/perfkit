/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { JSDOM } from "jsdom";
import { createLiveDomView } from "../../../src/render/app/createLiveDomView.js";
import type { LiveViewContext } from "../../../src/render/live/types.js";
import { MIN, STARTED_MS } from "../../live/state.js";
import { sampleLive } from "../../live/sample.js";
import { HISTORY } from "../live/history.js";

const NOW = STARTED_MS + 150 * MIN;
const ctx = (overrides: Partial<LiveViewContext> = {}): LiveViewContext => ({
  live: sampleLive(NOW - 5_000),
  runs: HISTORY,
  nowMs: NOW,
  connection: "ok",
  perfkitVersion: "0.2.0",
  ...overrides
});

describe("createLiveDomView", () => {
  it("should mount the live page over the report, then update it in place", () => {
    // Arrange
    const dom = new JSDOM(
      "<!doctype html><title>Report</title><main>report</main>"
    );
    const doc = dom.window.document;
    const view = createLiveDomView(doc);

    // Act
    view.showLive(ctx(), true);
    const nav = doc.querySelector(".nav");
    doc.querySelector("details")!.open = true;
    view.showLive(ctx({ nowMs: NOW + 70_000 }), false);

    // Assert
    expect(doc.title).to.equal("Routr benchmarks · running now · v2.32.2");
    expect(doc.querySelector(".nav")).to.equal(nav);
    expect(doc.querySelector("[data-updated]")?.className).to.equal(
      "updated is-stale"
    );
    expect(doc.querySelector("details")?.open).to.equal(true);
  });

  it("should tick the updated text and its tone only", () => {
    const dom = new JSDOM("<!doctype html><p>shell</p>");
    const doc = dom.window.document;
    const view = createLiveDomView(doc);
    view.showLive(ctx(), true);
    const main = doc.getElementById("live-main")!.innerHTML;

    view.tick(ctx({ nowMs: NOW + 3_000 }));
    expect(doc.querySelector("[data-updated]")?.textContent).to.equal(
      "updated 8 s ago"
    );
    view.tick(ctx({ connection: "lost" }));

    expect(doc.querySelector("[data-updated]")?.textContent).to.equal(
      "connection lost, retrying"
    );
    expect(doc.querySelector("[data-updated]")?.className).to.equal(
      "updated is-lost"
    );
    expect(doc.getElementById("live-main")!.innerHTML).to.equal(main);
  });

  it("should mount the whole page when the live regions are missing", () => {
    const dom = new JSDOM("<!doctype html><p>shell</p>");
    const view = createLiveDomView(dom.window.document);
    view.showLive(ctx(), false);
    expect(dom.window.document.getElementById("live-main")).to.not.equal(null);
  });
});
