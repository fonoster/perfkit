/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import {
  createPlanRun,
  createResolveImageDigests,
  ImageNotFoundError
} from "../../src/infra/index.js";
import { perfkitConfigSchema } from "../../src/schemas/index.js";
import { loadConfig } from "../fixtures.js";
import { COMMIT, DIGEST, fakeRegistry, RUN_ID } from "./fakes.js";

function setup(registry = fakeRegistry()) {
  const getPublicIp = sinon.stub().resolves("203.0.113.7");
  const planRun = createPlanRun({
    resolveImageDigests: createResolveImageDigests({ registry }),
    getPublicIp
  });
  return { planRun, getPublicIp, registry };
}

const input = () => ({
  config: perfkitConfigSchema.parse(loadConfig()),
  targetVersion: "2.31.5",
  commit: COMMIT,
  startedAt: "2026-11-03T14:12:10Z"
});

describe("createPlanRun", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should plan both droplets, the names, the tags, the SSH source and the pinned images", async () => {
      // Arrange
      const { planRun } = setup();

      // Act
      const plan = await planRun(input());

      // Assert
      expect(plan).to.deep.include({
        runId: RUN_ID,
        project: "Routr",
        region: "nyc3",
        resourceName: `perfkit-${RUN_ID}`,
        runTag: `perfkit-run-${RUN_ID}`,
        tags: ["perfkit", `perfkit-run-${RUN_ID}`],
        sshSource: "203.0.113.7/32",
        maxLifetime: "9h"
      });
      expect(plan.uut).to.deep.equal({
        role: "uut",
        name: `perfkit-${RUN_ID}-uut`,
        size: "c-8",
        image: "ubuntu-22-04-x64"
      });
      expect(plan.loadgen.name).to.equal(`perfkit-${RUN_ID}-loadgen`);
      expect(plan.images.map(({ ref }) => ref)).to.deep.equal([
        `fonoster/routr-edgeport:2.31.5@${DIGEST.edgeport}`,
        `fonoster/routr-echo:2.31.5@${DIGEST.echo}`,
        `fonoster/routr-one:2.31.5@${DIGEST.one}`
      ]);
      expect(plan.benchmarks.map(({ id }) => id)).to.deep.equal([
        "edgeport-echo",
        "one-soak"
      ]);
    });

    it("should plan no worker with one load generator and count - 1 with more", async () => {
      // Arrange
      const { planRun } = setup();
      const config = loadConfig();
      const planFor = (count: number) => {
        config.infra.loadgen.count = count;
        return planRun({
          ...input(),
          config: perfkitConfigSchema.parse(config)
        });
      };

      // Act
      const [one, three] = [await planFor(1), await planFor(3)];

      // Assert
      expect(one.workers).to.deep.equal([]);
      expect(three.workers).to.deep.equal(
        [1, 2].map((n) => ({
          role: "worker",
          name: `perfkit-${RUN_ID}-worker-${n}`,
          size: "c-16",
          image: "ubuntu-22-04-x64"
        }))
      );
    });

    it("should keep only the benchmarks asked for", async () => {
      // Arrange
      const { planRun } = setup();

      // Act
      const plan = await planRun({ ...input(), benchmarks: ["one-soak"] });

      // Assert
      expect(plan.benchmarks.map(({ id }) => id)).to.deep.equal(["one-soak"]);
    });

    it("should throw ImageNotFoundError for a missing tag", async () => {
      // Arrange
      const { planRun } = setup(fakeRegistry({}));

      // Act + Assert
      const err = await planRun(input()).catch((e: unknown) => e);
      expect(err).to.be.instanceOf(ImageNotFoundError);
      expect((err as Error).message).to.equal(
        "image fonoster/routr-edgeport:2.31.5 not found on Docker Hub"
      );
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and look nothing up", async () => {
      // Arrange
      const { planRun, getPublicIp, registry } = setup();

      // Act
      const err = await planRun({
        ...input(),
        targetVersion: "bad tag",
        commit: "xyz",
        benchmarks: ["nope"]
      }).catch((e: unknown) => e);

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(
        (err as ValidationError).fieldErrors.map(({ field }) => field)
      ).to.deep.equal(["benchmarks[0]", "commit", "targetVersion"]);
      expect(getPublicIp.callCount).to.equal(0);
      expect(registry.asked).to.deep.equal([]);
    });
  });
});
