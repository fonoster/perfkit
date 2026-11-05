/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { createLiveController } from "../../../src/render/app/createLiveController.js";
import type { LiveViewContext } from "../../../src/render/live/types.js";
import type { Live, RunEntry } from "../../../src/schemas/index.js";
import { sampleLive } from "../../live/sample.js";
import { HISTORY } from "../live/history.js";

type Reply = { status: number; text: string } | Error;

function setup(replies: Reply[], published: RunEntry[][] = []) {
  const events: string[] = [];
  const shown: LiveViewContext[] = [];
  let now = Date.parse("2026-11-06T16:32:12Z");
  const controller = createLiveController({
    liveUrl: "https://x.ngrok-free.dev/live.json",
    version: "0.2.0",
    fetchLive: async () => {
      const reply = replies.shift() ?? new Error("offline");
      if (reply instanceof Error) throw reply;
      return reply;
    },
    fetchRuns: async () => published.shift() ?? HISTORY,
    view: {
      showLive: (ctx, first) => {
        shown.push(ctx);
        events.push(
          `live ${first ? "mount" : "update"} ${ctx.live.status} ${ctx.connection}`
        );
      },
      tick: (ctx) => {
        events.push(`tick ${ctx.connection}`);
      },
      showFinal: async () => {
        events.push("final");
      }
    },
    now: () => (now += 1000)
  });
  return { controller, events, shown };
}

const ok = (live: Live) => ({ status: 200, text: JSON.stringify(live) });
const running = sampleLive();
const finished: Live = { ...running, status: "finished", estimatedEndAt: null };
const publishedRun = { ...HISTORY[0]!, id: running.runId };

describe("createLiveController", () => {
  it("should leave the published report when no run is in progress", async () => {
    // Arrange: nothing served, then 503, then an invalid file, then a run already finished
    const { controller, events } = setup([
      new Error("offline"),
      { status: 503, text: "no snapshot yet" },
      { status: 200, text: "{}" },
      ok(finished)
    ]);

    // Act
    const modes = [
      await controller.poll(),
      await controller.poll(),
      await controller.poll(),
      await controller.poll()
    ];
    controller.tick();

    // Assert
    expect(modes).to.deep.equal(["final", "final", "final", "final"]);
    expect(events).to.deep.equal([]);
  });

  it("should go live for a run in progress, mount once, then update in place", async () => {
    const { controller, events, shown } = setup([ok(running), ok(running)]);
    expect(await controller.poll()).to.equal("live");
    await controller.poll();
    controller.tick();
    expect(events).to.deep.equal([
      "live mount running ok",
      "live update running ok",
      "tick ok"
    ]);
    expect(shown[0]?.runs).to.deep.equal(HISTORY);
  });

  it("should say the connection is lost when a poll fails, and come back", async () => {
    const { controller, events } = setup([
      ok(running),
      new Error("offline"),
      ok(running)
    ]);
    await controller.poll();
    expect(await controller.poll()).to.equal("live");
    controller.tick();
    await controller.poll();
    expect(events).to.deep.equal([
      "live mount running ok",
      "live update running lost",
      "tick lost",
      "live update running ok"
    ]);
  });

  it("should wait for the report once the run finished, then show it", async () => {
    // Arrange: runs.json first without the run, then with it
    const { controller, events } = setup(
      [ok(running), ok(finished), ok(finished)],
      [HISTORY, HISTORY, [publishedRun, ...HISTORY]]
    );

    // Act
    await controller.poll();
    const waiting = await controller.poll();
    const after = await controller.poll();

    // Assert
    expect(waiting).to.equal("live");
    expect(after).to.equal("final");
    expect(events).to.deep.equal([
      "live mount running ok",
      "live update finished ok",
      "live update finished ok",
      "final"
    ]);
  });

  it("should show the report when the server is gone but the run was published", async () => {
    const { controller, events } = setup(
      [ok(running), new Error("offline")],
      [HISTORY, [publishedRun, ...HISTORY]]
    );
    await controller.poll();
    expect(await controller.poll()).to.equal("final");
    expect(events.at(-1)).to.equal("final");
  });

  it("should mount again when another run starts", async () => {
    const other = { ...running, runId: "20261107T140212Z-bd3254a" };
    const { controller, events } = setup([ok(running), ok(other)]);
    await controller.poll();
    await controller.poll();
    expect(events).to.deep.equal([
      "live mount running ok",
      "live mount running ok"
    ]);
  });
});
