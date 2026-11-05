/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRenderSite } from "../../src/render/createRenderSite.js";
import { runsSchema, siteSchema } from "../../src/schemas/index.js";
import { EXAMPLES, ROUTR_CONFIG } from "../fixtures.js";
import { drawFrom, loadHistory, makeDeps, RUNS_4, runRender } from "./site.js";

const LOGO = readFileSync(join(EXAMPLES, "routr", "logo.svg"), "utf8").trim();

describe("perfkit render --config", () => {
  it("should write a site with no runs: the app, an empty history, site.json and the shell", async () => {
    // Act
    const result = await runRender([
      "render",
      "--config",
      ROUTR_CONFIG,
      "--out",
      "out"
    ]);

    // Assert
    expect(result.code).to.equal(0);
    expect(result.err).to.equal("");
    expect(result.out).to.equal(
      [
        `wrote ${join("out/app/9.8.7/app.js")} (perfkit 9.8.7)`,
        `wrote ${join("out/data/runs.json")} (0 runs)`,
        `wrote ${join("out/data/site.json")} (no live URL)`,
        `wrote ${join("out/index.html")} (no runs yet)`,
        ""
      ].join("\n")
    );
    const runs = runsSchema.parse(
      JSON.parse(result.written.get(join("out", "data", "runs.json")) ?? "")
    );
    expect(runs).to.deep.equal({
      schema: "perfkit/runs/v1",
      project: "Routr",
      runs: []
    });
    const site = siteSchema.parse(
      JSON.parse(result.written.get(join("out", "data", "site.json")) ?? "")
    );
    expect(site.project.name).to.equal("Routr");
    expect(site.project.logoSvg).to.equal(LOGO);
    expect(result.written.get(join("out", "index.html"))).to.contain(
      "<title>Routr benchmarks</title>"
    );
  });

  it("should put the config's live URL in site.json", async () => {
    // Arrange
    const config = readFileSync(ROUTR_CONFIG, "utf8").replace(
      /^project:\n/m,
      "project:\n  live:\n    url: https://live.example/live.json\n"
    );
    const path = join(EXAMPLES, "routr", "with-live.yaml");
    const { deps, written } = makeDeps({ [path]: config });

    // Act
    const result = await createRenderSite(deps)({ config: path, out: "o" });

    // Assert
    expect(result.ok).to.equal(true);
    const site = JSON.parse(written.get(join("o", "data", "site.json")) ?? "");
    expect(site.project.live).to.deep.equal({
      url: "https://live.example/live.json"
    });
  });

  it("should keep a given history as it is, with a shell per run", async () => {
    // Arrange
    const history = loadHistory(RUNS_4);
    const { deps, written } = makeDeps({ "runs.json": history });

    // Act
    const result = await createRenderSite(deps)({
      config: ROUTR_CONFIG,
      history: "runs.json",
      out: "o"
    });

    // Assert
    expect(result.ok).to.equal(true);
    expect(
      JSON.parse(written.get(join("o", "data", "runs.json")) ?? "")
    ).to.deep.equal(history);
    history.runs.forEach((run: { id: string }) => {
      expect(written.has(join("o", "runs", run.id, "index.html"))).to.equal(
        true
      );
    });
  });

  it("should draw the no-runs page from what it wrote", async () => {
    // Arrange
    const { deps, written } = makeDeps();
    await createRenderSite(deps)({ config: ROUTR_CONFIG, out: "o" });
    const draw = await drawFrom(written, "o");

    // Act
    const result = await draw("");

    // Assert
    expect(result.ok && result.runId).to.equal(null);
    expect(result.ok && result.html).to.contain("No published runs yet.");
  });

  it("should exit 2 with validate's lines for an invalid config", async () => {
    // Act
    const result = await runRender(
      ["render", "--config", "bad.yaml", "--out", "out"],
      { "bad.yaml": "apiVersion: perfkit/v1\nproject: {}\n" }
    );

    // Assert
    expect(result.code).to.equal(2);
    expect(result.err).to.match(/^bad\.yaml: /);
    expect(result.written.size).to.equal(0);
  });

  it("should exit 1 with both --report and --config, or neither", async () => {
    // Act
    const both = await runRender([
      "render",
      "--report",
      "r.json",
      "--config",
      ROUTR_CONFIG,
      "--out",
      "out"
    ]);
    const neither = await runRender(["render", "--out", "out"]);

    // Assert
    [both, neither].forEach((result) => {
      expect(result.code).to.equal(1);
      expect(result.err).to.contain("--report <file> or --config");
      expect(result.written.size).to.equal(0);
    });
  });

  it("should throw ValidationError for both report and config", async () => {
    // Arrange
    const { deps } = makeDeps();

    // Act
    const error = await createRenderSite(deps)({
      report: "r.json",
      config: ROUTR_CONFIG,
      out: "o"
    }).then(
      () => null,
      (err: unknown) => err
    );

    // Assert
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).name).to.equal("ValidationError");
  });
});
