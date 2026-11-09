/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import { createSweep } from "../../src/infra/index.js";
import { FakeDigitalOcean, START } from "./fakes.js";

describe("createSweep", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should skip a perfkit-tagged droplet whose name is not a perfkit run's", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      client.seedDroplet({
        name: "my-own-droplet",
        tags: ["perfkit"],
        createdAt: START - 48 * 3600 * 1000
      });
      const teardown = sinon.stub();
      const sweep = createSweep({ client, teardown, now: () => START });

      // Act
      const result = await sweep({ olderThan: "9h" });

      // Assert
      expect(result).to.deep.equal({ dryRun: false, runs: [] });
      expect(teardown.callCount).to.equal(0);
    });

    it("should sweep a run's worker load generators like its other droplets", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      const runId = "20261103T021210Z-41d9a2c";
      ["uut", "loadgen", "worker-1", "worker-2"].forEach((role) =>
        client.seedDroplet({
          name: `perfkit-${runId}-${role}`,
          tags: ["perfkit", `perfkit-run-${runId}`],
          createdAt: START - 10 * 3600 * 1000
        })
      );
      const teardown = sinon.stub().resolves({ deleted: [], failures: [] });
      const sweep = createSweep({ client, teardown, now: () => START });

      // Act
      const result = await sweep({ olderThan: "9h" });

      // Assert
      expect(result.runs).to.have.length(1);
      const resources = teardown.firstCall.args[0] as {
        droplets: Array<{ name: string; role: string }>;
      };
      expect(resources.droplets.map(({ name }) => name)).to.have.length(4);
      expect(resources.droplets.map(({ role }) => role)).to.have.members([
        "uut",
        "loadgen",
        "worker",
        "worker"
      ]);
    });

    it("should look only at droplets tagged perfkit", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      const sweep = createSweep({
        client,
        teardown: sinon.stub(),
        now: () => START
      });

      // Act
      await sweep({});

      // Assert
      expect(client.callsTo("listDroplets")).to.deep.equal([
        [{ tag: "perfkit" }]
      ]);
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and list nothing", async () => {
      // Arrange
      const client = new FakeDigitalOcean();
      const sweep = createSweep({
        client,
        teardown: sinon.stub(),
        now: () => START
      });

      // Act
      const err = await sweep({ olderThan: "soon", runId: "x" }).catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(client.calls).to.deep.equal([]);
    });
  });
});
