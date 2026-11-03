/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  countRestarts,
  type ProcessSample,
  toResources
} from "../../src/analyze/index.js";

const at = (
  tMs: number,
  name: string,
  pid: number,
  cpuTicks = 0,
  host: ProcessSample["host"] = "uut"
): ProcessSample => ({
  t: new Date(tMs).toISOString(),
  tMs,
  host,
  name,
  pid,
  rssKB: 2048,
  cpuTicks,
  clkTck: 100,
  fds: 9
});

describe("countRestarts", () => {
  it("should count a pid change once", () => {
    const samples = [
      at(0, "one", 1),
      at(1, "one", 1),
      at(2, "one", 2),
      at(3, "one", 2)
    ];
    expect(countRestarts(samples, ["one"])).to.equal(1);
  });

  it("should count a run of missing samples once, without the new pid", () => {
    const samples = [
      at(0, "one", 1),
      at(0, "edgeport", 5),
      at(1, "edgeport", 5),
      at(2, "edgeport", 5),
      at(3, "one", 7),
      at(3, "edgeport", 5)
    ];
    expect(countRestarts(samples, ["one", "edgeport"])).to.equal(1);
  });

  it("should count a configured process that is never sampled", () => {
    expect(countRestarts([at(0, "one", 1)], ["one", "postgres"])).to.equal(1);
  });

  it("should ignore the load generator", () => {
    const samples = [
      at(0, "one", 1),
      at(1, "one", 1),
      at(1, "one", 9, 0, "loadgen")
    ];
    expect(countRestarts(samples, ["one"])).to.equal(0);
  });
});

describe("toResources", () => {
  it("should list the configured processes with RSS in MB and CPU since the last sample", () => {
    // Arrange
    const samples = [
      at(0, "one", 1, 0),
      at(10_000, "one", 1, 500),
      at(20_000, "one", 3, 600),
      at(0, "sipp-uac", 1, 0, "loadgen")
    ];

    // Act
    const resources = toResources(samples, ["one", "postgres"]);

    // Assert
    expect(resources).to.deep.equal({
      processes: [
        {
          name: "one",
          samples: [
            {
              t: "1970-01-01T00:00:00.000Z",
              rssMB: 2,
              cpuPct: 0,
              fds: 9,
              pid: 1
            },
            {
              t: "1970-01-01T00:00:10.000Z",
              rssMB: 2,
              cpuPct: 50,
              fds: 9,
              pid: 1
            },
            {
              t: "1970-01-01T00:00:20.000Z",
              rssMB: 2,
              cpuPct: 0,
              fds: 9,
              pid: 3
            }
          ]
        },
        { name: "postgres", samples: [] }
      ]
    });
  });
});
