/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REMOTE_ROOT } from "../../src/orchestrate/constants.js";
import { downloadPartialRaw } from "../../src/orchestrate/downloadPartialRaw.js";
import type { Remote } from "../../src/orchestrate/types.js";
import { FakeHosts, writeRaw } from "./harness.js";

async function setup() {
  const hosts = await FakeHosts.create();
  const raw = join(hosts.roots.loadgen, "raw");
  await writeRaw(join(raw, "edgeport-echo"), { done: "x\n" });
  await writeRaw(join(raw, "one-soak"), { "uac_stat.csv": "StartTime;\n" });
  const remote: Remote = {
    exec: (host, command) => hosts.exec(host, command, "cli"),
    upload: hosts.upload,
    download: hosts.download
  };
  const runDir = await mkdtemp(join(tmpdir(), "perfkit-run-"));
  return { hosts, remote, runDir };
}

describe("downloadPartialRaw", () => {
  it("should download every benchmark not downloaded yet, finished or not", async () => {
    // Arrange
    const { remote, runDir } = await setup();

    // Act
    const ids = await downloadPartialRaw({
      remote,
      root: REMOTE_ROOT,
      runDir,
      downloaded: new Set(["edgeport-echo"])
    });

    // Assert
    expect(ids).to.deep.equal(["one-soak"]);
    expect(await readdir(join(runDir, "raw"))).to.deep.equal(["one-soak"]);
    expect(
      await readFile(join(runDir, "raw", "one-soak", "uac_stat.csv"), "utf8")
    ).to.equal("StartTime;\n");
  });

  it("should return nothing when the load generator does not answer", async () => {
    // Arrange
    const { hosts, remote, runDir } = await setup();
    hosts.down.add("loadgen");

    // Act
    const ids = await downloadPartialRaw({
      remote,
      root: REMOTE_ROOT,
      runDir,
      downloaded: new Set()
    });

    // Assert
    expect(ids).to.deep.equal([]);
  });

  it("should skip a benchmark whose download fails and keep the others", async () => {
    // Arrange
    const { remote, runDir } = await setup();
    const failing: Remote = {
      ...remote,
      download: async (host, remotePath, localPath) => {
        if (remotePath.endsWith("/edgeport-echo")) throw new Error("scp");
        return remote.download(host, remotePath, localPath);
      }
    };

    // Act
    const ids = await downloadPartialRaw({
      remote: failing,
      root: REMOTE_ROOT,
      runDir,
      downloaded: new Set()
    });

    // Assert
    expect(ids).to.deep.equal(["one-soak"]);
  });

  it("should ignore names that are not benchmark ids", async () => {
    // Arrange
    const { remote, runDir } = await setup();
    const listing: Remote = {
      ...remote,
      exec: async () => ({ code: 0, stdout: "../etc\nNot An Id\n", stderr: "" })
    };

    // Act
    const ids = await downloadPartialRaw({
      remote: listing,
      root: REMOTE_ROOT,
      runDir,
      downloaded: new Set()
    });

    // Assert
    expect(ids).to.deep.equal([]);
  });
});
