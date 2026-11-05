/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import * as cheerio from "cheerio";
import { renderLivePage } from "../../../src/render/live/renderLivePage.js";
import { GROWTH_NOTE } from "../../../src/render/live/renderLiveSoak.js";
import { renderLiveView } from "../../../src/render/live/renderLiveView.js";
import type { LiveViewContext } from "../../../src/render/live/types.js";
import type { LiveCapacity } from "../../../src/schemas/index.js";
import {
  CAPACITY,
  MIN,
  point,
  record,
  runState,
  STARTED_MS
} from "../../live/state.js";
import { buildLiveSnapshot } from "../../../src/live/buildLiveSnapshot.js";
import { sampleLive } from "../../live/sample.js";
import { HISTORY } from "./history.js";

const NOW = STARTED_MS + 150 * MIN;

function ctx(overrides: Partial<LiveViewContext> = {}): LiveViewContext {
  return {
    live: sampleLive(NOW - 8_000),
    runs: HISTORY,
    nowMs: NOW,
    connection: "ok",
    perfkitVersion: "0.2.0",
    ...overrides
  };
}

const text = (html: string) =>
  cheerio.load(html).root().text().replace(/\s+/g, " ");

describe("renderLiveView", () => {
  it("should draw the nav's live picker, the preliminary banner and the header", () => {
    // Act
    const parts = renderLiveView(ctx());

    // Assert
    expect(text(parts.nav))
      .to.contain("Running now · v2.32.2")
      .and.contain("live");
    expect(text(parts.banner)).to.contain(
      "Running now. These numbers are preliminary and change every 15 seconds; the verdict appears when the run ends."
    );
    expect(text(parts.banner)).to.contain("updated 8 s ago");
    const $ = cheerio.load(parts.main);
    expect($(".eyebrow-live").text()).to.equal("LIVE · RUN 20261106T140212Z");
    expect($("h1").text()).to.equal("Routr 2.32.2 is under test right now.");
    expect($(".lead").text()).to.equal(
      "Two benchmarks run one after another on two dedicated DigitalOcean servers. Watch each one as it happens; nothing on this page is final until the run ends."
    );
  });

  it("should draw the progress cards and the overall bar", () => {
    const $ = cheerio.load(renderLiveView(ctx()).main);
    const steps = $(".step")
      .map((_, el) => $(el).attr("class"))
      .get();
    expect(steps).to.deep.equal([
      "step step-done",
      "step step-done",
      "step step-running"
    ]);
    expect($(".step-sub").first().text()).to.equal(
      "servers up, images pinned · 2 min"
    );
    expect($(".overall-text").text()).to.match(
      /^\d+% · ends about \d\d:\d\d UTC$/
    );
  });

  it("should draw a done ramp's chart with its preliminary limit and the last published result", () => {
    const $ = cheerio.load(renderLiveView(ctx()).main);
    const section = $(`#${CAPACITY.id}`);
    expect(section.find(".eyebrow").text()).to.equal("01 · CAPACITY · DONE");
    expect(section.find(".so-far-value").text()).to.equal(
      "Held 100 messages/s"
    );
    expect(section.find(".baseline").text()).to.equal(
      "Last published result: 1,240 messages/s on v2.31.5. 1,140 messages/s to go to match it."
    );
    expect(section.find(".limit-line")).to.have.length(1);
  });

  it("should draw a running ramp up to the step offered now, with the rest shaded", () => {
    // Arrange
    const live = buildLiveSnapshot({
      state: runState({ selected: [CAPACITY.id] }),
      record: record({
        [CAPACITY.id]: {
          startedMs: STARTED_MS,
          loadStartedMs: STARTED_MS,
          points: [point(50), point(100)]
        }
      }),
      nowMs: STARTED_MS + 2.5 * MIN,
      soaks: new Map()
    });

    // Act
    const $ = cheerio.load(
      renderLiveView(ctx({ live, nowMs: STARTED_MS + 2.5 * MIN })).main
    );

    // Assert
    expect($(".so-far-value").text()).to.equal("Held 100 messages/s so far");
    expect($(".so-far p").eq(1).text()).to.match(
      /^2 steps passed both rules\./
    );
    expect($(".not-run-label").text()).to.equal("steps not run yet");
    expect($(".now-tag-text").text()).to.equal("now 150 messages/s");
    expect($(".legend-live").text()).to.equal("live");
    expect(
      $(".stat-value")
        .map((_, el) => $(el).text())
        .get()
    ).to.deep.equal(["150", "8 ms", "0%", "0:02"]);
    expect((live.benchmarks[0] as LiveCapacity).current?.index).to.equal(2);
  });

  it("should draw a soak's raw memory with the warm-up, a now line and the growth note", () => {
    const $ = cheerio.load(renderLiveView(ctx()).main);
    const soak = $("#one-soak");
    expect(soak.find(".eyebrow").text()).to.equal("02 · SOAK · RUNNING");
    expect(soak.find(".section-meta").text()).to.equal(
      "45 min of 6 h 30 min · 270K calls · 12 failed"
    );
    expect(soak.find(".warmup-label").text()).to.equal("warm-up, not measured");
    expect(soak.find(".now-label").text()).to.equal("now");
    expect(soak.find(".rule-note").text()).to.equal(GROWTH_NOTE);
    expect(soak.find(".card-title").first().text()).to.equal(
      "Memory per process, raw"
    );
  });

  it("should turn the updated text warning-coloured, then lost", () => {
    const stale = cheerio.load(
      renderLiveView(ctx({ nowMs: NOW + 70_000 })).banner
    );
    expect(stale(".updated").attr("class")).to.equal("updated is-stale");
    const lost = cheerio.load(
      renderLiveView(ctx({ connection: "lost" })).banner
    );
    expect(lost(".updated").text()).to.equal("connection lost, retrying");
    expect(lost(".updated").attr("class")).to.equal("updated is-lost");
  });

  it("should say the report is being published once the run finished", () => {
    const live = {
      ...sampleLive(),
      status: "finished" as const,
      estimatedEndAt: null
    };
    const parts = renderLiveView(ctx({ live }));
    expect(text(parts.banner)).to.contain(
      "Run finished; the report is being published."
    );
    expect(cheerio.load(parts.main)(".eyebrow-live").text()).to.match(/^ENDED/);
  });

  it("should leave a benchmark not in this run out", () => {
    const live = buildLiveSnapshot({
      state: runState({ selected: [CAPACITY.id], mode: "local" }),
      record: record({}),
      nowMs: STARTED_MS,
      soaks: new Map()
    });
    const $ = cheerio.load(renderLiveView(ctx({ live, runs: [] })).main);
    expect($("#one-soak")).to.have.length(0);
    expect($(".lead").text()).to.match(
      /^One benchmark runs on this machine's Docker\./
    );
    expect($(".step-running .step-title").text()).to.contain("Setup");
  });
});

describe("renderLivePage", () => {
  it("should be a whole page with the report's styles, the live styles and the regions the app updates", () => {
    const html = renderLivePage(ctx());
    const $ = cheerio.load(html);
    expect($("title").text()).to.equal(
      "Routr benchmarks · running now · v2.32.2"
    );
    expect($("#live-banner, #live-main, #live-footer")).to.have.length(3);
    expect($("body").attr("data-live-run")).to.equal(
      "20261106T140212Z-bd3254a"
    );
    expect($("style").text()).to.contain("prefers-reduced-motion");
    expect($("[data-picker]")).to.have.length(1);
  });
});
