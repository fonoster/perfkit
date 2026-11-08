/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { createKindCluster } from "../../src/cli/createKindCluster.js";
import { ValidationError } from "../../src/errors/index.js";

describe("createKindCluster", () => {
  it("should throw ValidationError for a name that is not perfkit-<run id> and run nothing", async () => {
    // Arrange
    const run = sinon.stub();
    const create = createKindCluster({ run, writeFile: sinon.stub() });

    // Act
    const err = await create({
      name: "routr-spike",
      runId: "20261108T120000Z-abcdef0",
      nodes: 2,
      dir: "/tmp/x",
      charts: [],
      images: []
    }).catch((e: unknown) => e);

    // Assert
    expect(err).to.be.instanceOf(ValidationError);
    expect(run.callCount).to.equal(0);
  });

  it("should throw when the kind network has no IPv4 subnet it can use", async () => {
    // Arrange
    const run = sinon
      .stub()
      .callsFake(async (_file: string, args: string[]) =>
        args[1]!.startsWith("docker network inspect")
          ? { code: 0, stdout: "fc00::/64 \n", stderr: "" }
          : { code: 0, stdout: "", stderr: "" }
      );
    const create = createKindCluster({
      run,
      writeFile: sinon.stub().resolves()
    });

    // Act
    const err = (await create({
      name: "perfkit-20261108t120000z-abcdef0",
      runId: "20261108T120000Z-abcdef0",
      nodes: 2,
      dir: "/tmp/x",
      charts: [],
      images: []
    }).catch((e: unknown) => e)) as Error;

    // Assert
    expect(err.message).to.equal(
      "the kind network has no IPv4 subnet of /24 or larger: fc00::/64"
    );
  });
});
