/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  perfkitConfigSchema,
  projectFromConfig
} from "../../src/schemas/index.js";
import { loadConfig } from "../fixtures.js";

const base = perfkitConfigSchema.parse(loadConfig());

function withLive(project: object, live: object | undefined) {
  return perfkitConfigSchema.parse({
    ...loadConfig(),
    project: { ...loadConfig().project, ...project },
    ...(live ? { live } : {})
  });
}

describe("projectFromConfig", () => {
  it("should take project.live.url, then live.url, then https://<live.domain>/live.json", () => {
    // Arrange
    const both = withLive(
      { live: { url: "https://project.example/live.json" } },
      { url: "https://live.example/live.json", domain: "perfkit.ngrok.app" }
    );
    const liveOnly = withLive(
      {},
      { url: "https://live.example/live.json", domain: "perfkit.ngrok.app" }
    );
    const domainOnly = withLive({}, { domain: "perfkit.ngrok.app" });

    // Act
    const urls = [both, liveOnly, domainOnly].map(
      (config) => projectFromConfig(config).live?.url
    );

    // Assert
    expect(urls).to.deep.equal([
      "https://project.example/live.json",
      "https://live.example/live.json",
      "https://perfkit.ngrok.app/live.json"
    ]);
  });

  it("should leave out live without one, and carry the inlined SVGs", () => {
    // Arrange
    const config = withLive({}, undefined);

    // Act
    const project = projectFromConfig(config, {
      logoSvg: "<svg/>",
      faviconSvg: "<svg></svg>"
    });

    // Assert
    expect(project).to.deep.equal({
      name: base.project.name,
      repo: base.project.repo,
      siteUrl: base.project.siteUrl,
      accent: base.project.accent,
      logoSvg: "<svg/>",
      faviconSvg: "<svg></svg>",
      title: base.project.title,
      lead: base.project.lead
    });
  });
});
