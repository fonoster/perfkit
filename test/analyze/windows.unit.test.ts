/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  cpuPctOver,
  type ProcessSample,
  type StatRow,
  sumStatRows,
  type UdpSample
} from "../../src/analyze/index.js";
import { udpDropsOver } from "../../src/analyze/udpDropsOver.js";

const sample = (tMs: number, cpuTicks: number, pid = 1): ProcessSample => ({
  t: new Date(tMs).toISOString(),
  tMs,
  host: "uut",
  name: "edgeport",
  pid,
  rssKB: 1024,
  cpuTicks,
  clkTck: 100,
  fds: 3
});

describe("cpuPctOver", () => {
  it("should be Δ cpuTicks / clkTck / Δ seconds × 100", () => {
    // Arrange: 150 ticks a second at 100 ticks/s is 1.5 cores.
    const samples = [0, 10_000, 20_000, 30_000].map((t) => sample(t, t * 0.15));

    // Act + Assert
    expect(cpuPctOver(samples, { fromMs: 0, toMs: 20_000 })).to.equal(150);
  });

  it("should add nothing across a pid change and be 0 with one sample", () => {
    // Arrange
    const samples = [sample(0, 0), sample(10_000, 500), sample(20_000, 10, 2)];

    // Act + Assert
    expect(cpuPctOver(samples, { fromMs: 0, toMs: 20_000 })).to.equal(25);
    expect(cpuPctOver(samples, { fromMs: 5_000, toMs: 15_000 })).to.equal(0);
  });
});

describe("udpDropsOver", () => {
  it("should add the rises of one host in the window", () => {
    // Arrange
    const samples: UdpSample[] = [
      { tMs: 0, host: "loadgen", drops: 5 },
      { tMs: 0, host: "uut", drops: 100 },
      { tMs: 10, host: "loadgen", drops: 8 },
      { tMs: 20, host: "loadgen", drops: 2 },
      { tMs: 30, host: "loadgen", drops: 4 },
      { tMs: 40, host: "loadgen", drops: 40 }
    ];

    // Act + Assert
    expect(udpDropsOver(samples, "loadgen", { fromMs: 0, toMs: 30 })).to.equal(
      5
    );
    expect(udpDropsOver(samples, "uut", { fromMs: 0, toMs: 30 })).to.equal(0);
  });
});

describe("sumStatRows", () => {
  it("should count a row in the window that holds the middle of its period", () => {
    // Arrange
    const rows: StatRow[] = [
      { tMs: 0, periodStartMs: 0, counters: { "OutgoingCall(P)": 0 } },
      {
        tMs: 10_000,
        periodStartMs: 0,
        counters: {
          "OutgoingCall(P)": 500,
          "FailedCall(P)": 3,
          "FailedTimeoutOnRecv(P)": 2,
          "FailedMaxUDPRetrans(P)": 1,
          "FailedTcpConnect(P)": 0,
          "FailedCall(C)": 9,
          "Retransmissions(P)": 4,
          CurrentCall: 51
        }
      },
      {
        tMs: 20_100,
        periodStartMs: 10_000,
        counters: { "OutgoingCall(P)": 700, CurrentCall: 70 }
      }
    ];

    // Act
    const sums = sumStatRows(rows, { fromMs: 0, toMs: 15_000 });

    // Assert
    expect(sums).to.deep.equal({
      attempted: 500,
      failed: 3,
      failuresByReason: { FailedTimeoutOnRecv: 2, FailedMaxUDPRetrans: 1 },
      retransmissions: 4,
      maxCurrentCalls: 51
    });
    expect(
      sumStatRows(rows, { fromMs: 15_000, toMs: 30_000 }).attempted
    ).to.equal(700);
  });

  it("should add up each SIPp process's peak concurrent calls", () => {
    // Arrange: two instances' rows, each peaking at its own time
    const row = (pid: string, tMs: number, current: number) => ({
      tMs,
      periodStartMs: tMs - 10_000,
      counters: { "OutgoingCall(P)": 10, CurrentCall: current },
      pid
    });
    const rows = [
      row("11", 20_000, 40),
      row("11", 30_000, 50),
      row("12", 20_100, 60),
      row("12", 30_100, 30)
    ];

    // Act
    const sums = sumStatRows(rows, { fromMs: 0, toMs: 60_000 });

    // Assert
    expect(sums.maxCurrentCalls).to.equal(110);
    expect(sums.attempted).to.equal(40);
  });
});
