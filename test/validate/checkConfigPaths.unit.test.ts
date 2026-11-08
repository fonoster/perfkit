/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { resolve } from "node:path";
import sinon from "sinon";
import { perfkitConfigSchema } from "../../src/schemas/index.js";
import { checkConfigPaths } from "../../src/validate/index.js";
import { loadConfig } from "../fixtures.js";

describe("checkConfigPaths", () => {
  const config = perfkitConfigSchema.parse(loadConfig());

  afterEach(() => {
    sinon.restore();
  });

  it("should check every path the config names, relative to its directory", async () => {
    // Arrange
    const isFile = sinon.stub().resolves(true);

    // Act
    const errors = await checkConfigPaths(config, "/perf", isFile);

    // Assert
    expect(errors).to.deep.equal([]);
    expect(isFile.args.map(([path]) => path)).to.deep.equal(
      [
        "logo.svg",
        "edgeport-echo/compose.yaml",
        "edgeport-echo/uac_message.xml",
        "one-soak/compose.yaml",
        "one-soak/seed.js",
        "one-soak/uac_invite.xml",
        "one-soak/callers.csv",
        "one-soak/uac_register.xml",
        "one-soak/callees.csv",
        "one-soak/uas_answer.xml"
      ].map((path) => resolve("/perf", path))
    );
  });

  it("should check a helm chart's Chart.yaml, values and setup, and a capacity benchmark's callees", async () => {
    // Arrange
    const raw = loadConfig();
    raw.infra.cluster = { size: "c-8", nodes: 3 };
    raw.benchmarks[0].uut = {
      helm: {
        chart: "../ops/charts/connect",
        values: "k8s/values.yaml",
        entry: { service: "routr-edgeport-tcp", port: 5060 },
        setup: "k8s/seed.sh",
        pods: [{ name: "edgeport", selector: "service=edgeport" }]
      }
    };
    raw.benchmarks[0].load.register = {
      scenario: "one-soak/uac_register.xml",
      users: "one-soak/missing.csv"
    };
    const helm = perfkitConfigSchema.parse(raw);
    const isFile = sinon
      .stub()
      .callsFake(async (path: string) => !path.endsWith("missing.csv"));

    // Act
    const errors = await checkConfigPaths(helm, "/repo/perf", isFile);

    // Assert
    expect(isFile.args.map(([path]) => path).slice(1, 4)).to.deep.equal([
      "/repo/ops/charts/connect/Chart.yaml",
      "/repo/perf/k8s/values.yaml",
      "/repo/perf/k8s/seed.sh"
    ]);
    expect(errors).to.deep.equal([
      {
        path: "benchmarks[0].load.register.users",
        message: "file not found: one-soak/missing.csv"
      }
    ]);
  });

  it("should check project.favicon when it is set", async () => {
    // Arrange
    const withFavicon = perfkitConfigSchema.parse({
      ...loadConfig(),
      project: { ...loadConfig().project, favicon: "favicon.svg" }
    });
    const isFile = sinon
      .stub()
      .callsFake(
        async (path: string) => path !== resolve("/perf", "favicon.svg")
      );

    // Act
    const errors = await checkConfigPaths(withFavicon, "/perf", isFile);

    // Assert
    expect(errors).to.deep.equal([
      { path: "project.favicon", message: "file not found: favicon.svg" }
    ]);
  });

  it("should name the field of each missing file", async () => {
    // Arrange
    const missing = [
      resolve("/perf", "one-soak/seed.js"),
      resolve("/perf", "edgeport-echo/compose.yaml")
    ];
    const isFile = sinon
      .stub()
      .callsFake(async (path: string) => !missing.includes(path));

    // Act
    const errors = await checkConfigPaths(config, "/perf", isFile);

    // Assert
    expect(errors).to.deep.equal([
      {
        path: "benchmarks[0].uut.compose",
        message: "file not found: edgeport-echo/compose.yaml"
      },
      {
        path: "benchmarks[1].uut.setup",
        message: "file not found: one-soak/seed.js"
      }
    ]);
  });
});

describe("checkConfigPaths with uas and no register", () => {
  it("should still check load.uas.scenario", async () => {
    // Arrange
    const raw = loadConfig();
    delete raw.benchmarks[1].load.register;
    const config = perfkitConfigSchema.parse(raw);
    const isFile = sinon.stub().resolves(false);

    // Act
    const errors = await checkConfigPaths(config, "/perf", isFile);

    // Assert
    expect(errors.map((e) => e.path)).to.include(
      "benchmarks[1].load.uas.scenario"
    );
  });
});
