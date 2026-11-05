/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { toReportProject } from "../../src/orchestrate/toReportProject.js";
import { runState } from "../live/state.js";

describe("toReportProject", () => {
  it("should carry the project without a live URL when none is configured", () => {
    const project = toReportProject(runState());
    expect(project.name).to.equal("Routr");
    expect(project).to.not.have.property("live");
    expect(project).to.not.have.property("faviconSvg");
  });

  it("should carry the favicon SVG when the run has one", () => {
    const state = { ...runState(), faviconSvg: "<svg/>" };
    expect(toReportProject(state).faviconSvg).to.equal("<svg/>");
  });

  it("should take project.live.url first, then live.url, then the live domain's live.json", () => {
    const state = runState();
    const config = state.config;
    config.live = { port: 8787, domain: "routr-benchmarks.ngrok-free.dev" };
    expect(toReportProject(state).live?.url).to.equal(
      "https://routr-benchmarks.ngrok-free.dev/live.json"
    );
    config.live = { ...config.live, url: "https://b.example/live.json" };
    expect(toReportProject(state).live?.url).to.equal(
      "https://b.example/live.json"
    );
    config.project.live = { url: "https://a.example/live.json" };
    expect(toReportProject(state).live?.url).to.equal(
      "https://a.example/live.json"
    );
  });
});
