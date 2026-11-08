/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { arePodsReady } from "../../src/orchestrate/arePodsReady.js";

const pod = (
  name: string,
  ready: boolean,
  extra: Record<string, unknown> = {}
) => ({
  metadata: { name },
  status: {
    phase: "Running",
    conditions: [{ type: "Ready", status: ready ? "True" : "False" }]
  },
  ...extra
});

describe("arePodsReady", () => {
  it("should be ready when every running pod is Ready, leaving out finished and terminating ones", () => {
    const json = JSON.stringify({
      items: [
        pod("edgeport-0", true),
        { metadata: { name: "migrate-x" }, status: { phase: "Succeeded" } },
        {
          ...pod("old", false),
          metadata: { name: "old", deletionTimestamp: "2026-11-08T12:00:00Z" }
        }
      ]
    });
    expect(arePodsReady(json)).to.deep.equal({ ready: true });
  });

  it("should name the pods not Ready yet, and not be ready with no pod or bad JSON", () => {
    const json = JSON.stringify({ items: [pod("a", true), pod("b", false)] });
    expect(arePodsReady(json)).to.deep.equal({ ready: false, waiting: ["b"] });
    expect(arePodsReady(JSON.stringify({ items: [] }))).to.deep.equal({
      ready: false,
      waiting: []
    });
    expect(arePodsReady("{")).to.deep.equal({ ready: false, waiting: [] });
  });
});
