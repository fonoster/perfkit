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
        "edgeport-echo/uac_invite.xml",
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
