/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { EventEmitter } from "node:events";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import {
  createProvision,
  createTeardown,
  createWithRun,
  type SignalSource
} from "../../src/infra/index.js";
import { FakeDigitalOcean, fakeClock, fakeSsh, makePlan } from "./fakes.js";

function setup() {
  const { now, sleep } = fakeClock();
  const client = new FakeDigitalOcean(now);
  const signals = new EventEmitter() as EventEmitter & SignalSource;
  const withRun = createWithRun({
    provision: createProvision({ client, ssh: fakeSsh(), sleep, now }),
    teardown: createTeardown({ client, sleep, now }),
    signals
  });
  return { client, signals, withRun };
}

const NOTHING_LEFT = { droplets: [], vpcs: [], firewalls: [], keys: [] };

describe("createWithRun", () => {
  describe("with valid input", () => {
    it("should return the body's value and tear down", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      const outcome = await withRun(
        await makePlan(),
        async ({ run }) => run.uut.name
      );

      // Assert
      expect(outcome.status).to.equal("completed");
      expect(outcome).to.deep.include({ handedOff: false });
      expect((outcome as { value: string }).value).to.match(/-uut$/);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });

    it("should keep everything after a hand-off, even when the body then throws", async () => {
      // Arrange
      const { client, withRun } = setup();

      // Act
      const outcome = await withRun(await makePlan(), async (ctx) => {
        ctx.handOff();
        throw new Error("lost the agent's output");
      });

      // Assert
      expect(outcome).to.deep.include({ status: "failed", handedOff: true });
      expect(
        client.calls.filter(({ method }) => method.startsWith("delete"))
      ).to.deep.equal([]);
    });

    it("should tear down and report cancelled on SIGTERM, ignoring a hand-off after it", async () => {
      // Arrange
      const { client, signals, withRun } = setup();

      // Act
      const outcome = await withRun(await makePlan(), (ctx) => {
        signals.emit("SIGTERM");
        ctx.handOff();
        return new Promise(() => {});
      });

      // Assert
      expect(outcome.status).to.equal("cancelled");
      expect(outcome).to.deep.include({ signal: "SIGTERM" });
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
      expect(signals.listenerCount("SIGINT")).to.equal(0);
      expect(signals.listenerCount("SIGTERM")).to.equal(0);
    });

    it("should tear down what was created when a signal arrives during provisioning", async () => {
      // Arrange
      const { client, signals, withRun } = setup();
      const original = client.createDroplet.bind(client);
      client.createDroplet = async (input) => {
        const droplet = await original(input);
        signals.emit("SIGINT");
        return droplet;
      };
      const body = sinon.stub().resolves(1);

      // Act
      const outcome = await withRun(await makePlan(), body);

      // Assert
      expect(outcome.status).to.equal("cancelled");
      expect(body.callCount).to.equal(0);
      expect(client.callsTo("createDroplet")).to.have.length(1);
      expect(client.leftovers()).to.deep.equal(NOTHING_LEFT);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and create nothing", async () => {
      // Arrange
      const { client, withRun } = setup();
      const plan = await makePlan();

      // Act
      const err = await withRun(
        { ...plan, runId: "now" },
        "not a function" as never
      ).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(
        (err as ValidationError).fieldErrors.map(({ field }) => field)
      ).to.deep.equal(["body", "plan.runId"]);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
