/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNodeAnalyzeDeps,
  readSippResults
} from "../../src/analyze/index.js";
import { listRawDir } from "../../src/analyze/listRawDir.js";
import { readRawFile } from "../../src/analyze/readRawFile.js";
import { fakeDeps, RAW_DIR, readFixtureDir, rejection } from "./builders.js";

describe("readSippResults", () => {
  it("should pair the recorded stat and rtt files and time each call from StartTime", async () => {
    // Arrange
    const files = readFixtureDir("sipp-edgeport-echo");

    // Act
    const results = await readSippResults(
      fakeDeps(files),
      RAW_DIR,
      Object.keys(files),
      "perf/uac_invite_echo.xml"
    );

    // Assert
    expect(results?.rows).to.have.length(21);
    expect(results?.calls).to.have.length(17947);
    expect(results?.calls[0]).to.deep.equal({
      sentMs: 1793736284960.6 + 30.001 - 6,
      latencyMs: 6
    });
  });

  it("should merge every pid and return null without a stat file", async () => {
    // Arrange
    const stat = readFixtureDir("sipp-edgeport-echo")[
      "uac_invite_echo_1_.csv"
    ] as string;
    const files = {
      "uas_3_.csv": stat,
      "uas_4_.csv": stat,
      "uas_x_.csv": stat
    };

    // Act
    const uas = await readSippResults(
      fakeDeps(files),
      RAW_DIR,
      Object.keys(files),
      "uas.xml"
    );
    const none = await readSippResults(
      fakeDeps(files),
      RAW_DIR,
      Object.keys(files),
      "uac.xml"
    );

    // Assert
    expect(uas?.rows).to.have.length(42);
    expect(uas?.calls).to.deep.equal([]);
    expect(none).to.equal(null);
  });
});

describe("listRawDir", () => {
  it("should list the directory or name it when it does not exist", async () => {
    // Arrange
    const deps = fakeDeps({ "meta.json": "{}" });

    // Act + Assert
    expect(await listRawDir(deps, RAW_DIR)).to.deep.equal(["meta.json"]);
    const error = await rejection(listRawDir(deps, "/missing"));
    expect(error.message).to.equal(
      "/missing: cannot read the raw results: no such directory"
    );
  });
});

describe("readRawFile", () => {
  it("should read a listed file and name a missing one", async () => {
    // Arrange
    const deps = fakeDeps({ "meta.json": "{}" });

    // Act + Assert
    expect(
      await readRawFile(deps, RAW_DIR, ["meta.json"], "meta.json")
    ).to.equal("{}");
    const error = await rejection(
      readRawFile(deps, RAW_DIR, ["meta.json"], "udp.jsonl")
    );
    expect(error.message).to.equal(`${RAW_DIR}: missing udp.jsonl`);
  });
});

describe("createNodeAnalyzeDeps", () => {
  it("should read a real directory", async () => {
    // Arrange
    const dir = mkdtempSync(join(tmpdir(), "perfkit-analyze-"));
    writeFileSync(join(dir, "meta.json"), "{}");
    const deps = createNodeAnalyzeDeps();

    // Act
    const names = await deps.readdir(dir);
    const text = await deps.readFile(join(dir, "meta.json"));
    rmSync(dir, { recursive: true });

    // Assert
    expect(names).to.deep.equal(["meta.json"]);
    expect(text).to.equal("{}");
  });
});
