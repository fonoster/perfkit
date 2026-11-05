/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStatCsv, sumStatRows } from "../../src/analyze/index.js";
import { ValidationError } from "../../src/errors/index.js";
import { createLiveRecorder } from "../../src/live/createLiveRecorder.js";
import { createWriteLive } from "../../src/live/createWriteLive.js";
import type { HostShell } from "../../src/orchestrate/types.js";
import { liveSchema } from "../../src/schemas/index.js";
import { ROOT } from "../fixtures.js";
import { fakeFs } from "./fakeFs.js";
import { runState, SOAK, STARTED_MS } from "./state.js";

const RAW = `/opt/perfkit/raw/${SOAK.id}`;
const STAT = readFileSync(
  join(ROOT, "test/fixtures/sipp-edgeport-echo/uac_invite_echo_1_.csv"),
  "utf8"
);
const line = (tMs: number, name: string, rssKB: number) =>
  `${JSON.stringify({ t: new Date(tMs).toISOString().replace(/\.\d{3}Z$/, "Z"), host: "uut", name, pid: 7, rssKB, cpuTicks: 1, clkTck: 100, fds: 3 })}\n`;

function setup(mode: "local" | "digitalocean", files: Record<string, string>) {
  const fs = fakeFs(files);
  const commands: string[] = [];
  const chunks: string[] = [];
  const shell: HostShell = async (_host, command) => {
    commands.push(command);
    return { code: 0, stdout: chunks.shift() ?? "", stderr: "" };
  };
  const recorder = createLiveRecorder();
  recorder.started(SOAK.id, STARTED_MS);
  recorder.loadStarted(SOAK.id, STARTED_MS);
  const writeLive = createWriteLive({
    fs,
    shell,
    now: () => STARTED_MS + 60_000,
    state: runState({ mode, selected: [SOAK.id] }),
    recorder
  });
  return { fs, commands, chunks, writeLive, recorder };
}

describe("createWriteLive", () => {
  it("should write a valid live.json atomically with a soak's memory and calls (--local)", async () => {
    // Arrange
    const { fs, writeLive } = setup("local", {
      [`${RAW}/sampler-uut.jsonl`]:
        line(STARTED_MS, "one", 102400) +
        line(STARTED_MS + 10_000, "one", 103424) +
        '{"t":"half a line',
      [`${RAW}/uac_invite_42_.csv`]: STAT
    });

    // Act
    const live = await writeLive({});

    // Assert
    const written = JSON.parse(fs.files.get("/opt/perfkit/live.json") ?? "{}");
    expect(liveSchema.safeParse(written).success).to.equal(true);
    expect(fs.files.has("/opt/perfkit/live.json.tmp")).to.equal(false);
    const soak = live.benchmarks.find((b) => b.id === SOAK.id);
    expect(soak?.kind === "soak" && soak.memory[0]?.samples).to.deep.equal([
      { t: new Date(STARTED_MS).toISOString(), rssMB: 100 },
      { t: new Date(STARTED_MS + 10_000).toISOString(), rssMB: 101 }
    ]);
    const sums = sumStatRows(parseStatCsv(STAT, "stat").rows, {
      fromMs: 0,
      toMs: Infinity
    });
    expect(soak?.kind === "soak" && soak.calls).to.deep.equal({
      placed: sums.attempted,
      failed: sums.failed
    });
  });

  it("should read the UUT's sampler over SSH, only the bytes added since the last read", async () => {
    // Arrange
    const { commands, chunks, writeLive } = setup("digitalocean", {});
    const first = line(STARTED_MS, "one", 102400);
    chunks.push(first, line(STARTED_MS + 10_000, "one", 104448));

    // Act
    await writeLive({});
    const live = await writeLive({});

    // Assert
    expect(commands[0]).to.equal(
      `tail -c +1 ${RAW}/sampler-uut.jsonl 2>/dev/null; true`
    );
    expect(commands[1]).to.equal(
      `tail -c +${Buffer.byteLength(first) + 1} ${RAW}/sampler-uut.jsonl 2>/dev/null; true`
    );
    const soak = live.benchmarks.find((b) => b.id === SOAK.id);
    expect(
      soak?.kind === "soak" && soak.memory[0]?.samples.map((s) => s.rssMB)
    ).to.deep.equal([100, 102]);
  });

  it("should keep the last numbers when a file can't be read", async () => {
    // Arrange
    const { fs, writeLive } = setup("local", {
      [`${RAW}/sampler-uut.jsonl`]: line(STARTED_MS, "one", 102400)
    });
    await writeLive({});
    fs.files.delete(`${RAW}/sampler-uut.jsonl`);

    // Act
    const live = await writeLive({});

    // Assert
    const soak = live.benchmarks.find((b) => b.id === SOAK.id);
    expect(soak?.kind === "soak" && soak.memory[0]?.samples).to.have.length(1);
  });

  it("should throw ValidationError for options it doesn't take", async () => {
    const { writeLive } = setup("local", {});
    let error: unknown;
    await writeLive({ now: 1 }).catch((err: unknown) => {
      error = err;
    });
    expect(error).to.be.instanceOf(ValidationError);
  });
});
