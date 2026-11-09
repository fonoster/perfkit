/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { cpuPctOver } from "../../src/analyze/cpuPctOver.js";
import { countRestarts } from "../../src/analyze/countRestarts.js";
import { parseSamplerJsonl } from "../../src/analyze/parseSamplerJsonl.js";
import { toKubeSamplerLines } from "../../src/orchestrate/toKubeSamplerLines.js";

const T0 = Date.parse("2026-11-08T12:00:00Z");
const at = (s: number) =>
  new Date(T0 + s * 1000).toISOString().replace(/\.000Z$/, "Z");

function line(
  s: number,
  pods: Array<{
    pod: string;
    uid: string;
    restarts: number;
    cpu: string;
    mem: string;
  }>
) {
  return JSON.stringify({
    t: at(s),
    name: "edgeport",
    pods: pods.map(({ pod, uid, restarts }) => ({ pod, uid, restarts })),
    metrics: pods.map(({ pod, cpu, mem }) => ({
      pod,
      cpu: [cpu],
      memory: [mem]
    }))
  });
}

describe("toKubeSamplerLines", () => {
  it("should sum the pods' memory and integrate their CPU so CPU % reads as on the server", () => {
    // Arrange: two pods at 250m each, so 50% of one core in all
    const pods = (restarts = 0) => [
      { pod: "a", uid: "u1", restarts, cpu: "250m", mem: "100Mi" },
      { pod: "b", uid: "u2", restarts: 0, cpu: "250000000n", mem: "50Mi" }
    ];
    const text = [0, 10, 20, 30].map((s) => line(s, pods())).join("\n") + "\n";

    // Act
    const samples = parseSamplerJsonl(
      toKubeSamplerLines(text),
      "sampler.jsonl"
    );

    // Assert
    expect(samples).to.have.length(4);
    expect(samples[0]).to.include({
      host: "uut",
      name: "edgeport",
      pid: 1,
      rssKB: 150 * 1024,
      clkTck: 100,
      fds: 0
    });
    expect(
      cpuPctOver(samples, { fromMs: T0, toMs: T0 + 30_000 })
    ).to.be.closeTo(50, 0.01);
  });

  it("should count a container restart once, as a pid change", () => {
    // Arrange
    const pod = (restarts: number) => [
      { pod: "a", uid: "u1", restarts, cpu: "100m", mem: "10Mi" }
    ];
    const text = [
      line(0, pod(2)),
      line(10, pod(2)),
      line(20, pod(3)),
      line(30, pod(3))
    ].join("\n");

    // Act
    const samples = parseSamplerJsonl(
      toKubeSamplerLines(text),
      "sampler.jsonl"
    );

    // Assert
    expect(samples.map(({ pid }) => pid)).to.deep.equal([1, 1, 2, 2]);
    expect(countRestarts(samples, ["edgeport"])).to.equal(1);
  });

  it("should give no line for a tick without usage, and skip a half-written last line", () => {
    // Arrange
    const text = [
      JSON.stringify({
        t: at(0),
        name: "edgeport",
        pods: [{ pod: "a", uid: "u", restarts: 0 }],
        metrics: []
      }),
      line(10, [{ pod: "a", uid: "u", restarts: 0, cpu: "1m", mem: "1Ki" }]),
      '{"t":"2026-11-08T12:00:20Z","name":"edg'
    ].join("\n");

    // Act
    const out = toKubeSamplerLines(text);

    // Assert
    expect(out.trim().split("\n")).to.have.length(1);
    expect(JSON.parse(out)).to.include({ t: at(10), rssKB: 1 });
  });
});
