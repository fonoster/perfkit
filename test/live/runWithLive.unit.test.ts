/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { runWithLive } from "../../src/live/runWithLive.js";

/** A sleep that waits for the body, or an abort, instead of time. */
function setup() {
  const events: string[] = [];
  let release: () => void = () => {};
  const bodyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const deps = {
    writeLive: async () => {
      writes += 1;
      events.push(`write ${writes}`);
      if (writes === 2) throw new Error("disk full");
    },
    serve: async () => {
      events.push("serve");
      return {
        close: async () => {
          events.push("close");
        }
      };
    },
    sleep: async (ms: number, signal?: AbortSignal) => {
      events.push(`sleep ${ms}`);
      if (!signal) return;
      if (writes >= 3) {
        release();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve())
        );
      }
    },
    intervalMs: 15_000,
    lingerMs: 30_000
  };
  return { deps, events, bodyGate };
}

describe("runWithLive", () => {
  it("should write every interval, skip a failed write, write once more at the end and linger", async () => {
    // Arrange
    const { deps, events, bodyGate } = setup();

    // Act
    const result = await runWithLive(deps, async () => {
      await bodyGate;
      events.push("body done");
      return 42;
    });

    // Assert
    expect(result).to.equal(42);
    expect(events).to.deep.equal([
      "serve",
      "write 1",
      "sleep 15000",
      "write 2",
      "sleep 15000",
      "write 3",
      "sleep 15000",
      "body done",
      "write 4",
      "sleep 30000",
      "close"
    ]);
  });

  it("should pass the body's error through after closing", async () => {
    const { deps, events } = setup();
    let error: unknown;
    await runWithLive(deps, async () => {
      throw new Error("agent crashed");
    }).catch((err: unknown) => {
      error = err;
    });
    expect((error as Error).message).to.equal("agent crashed");
    expect(events.at(-1)).to.equal("close");
  });
});
