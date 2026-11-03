/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { ValidationError } from "../../src/errors/index.js";
import {
  createResolveImageDigests,
  ImageNotFoundError
} from "../../src/infra/index.js";
import { DIGEST, fakeRegistry } from "./fakes.js";

const IMAGES = {
  edgeport: "fonoster/routr-edgeport",
  echo: "fonoster/routr-echo"
};

describe("createResolveImageDigests", () => {
  describe("with valid input", () => {
    it("should pin each image at the tag to its digest, in perfkit.yaml order", async () => {
      // Arrange
      const resolve = createResolveImageDigests({ registry: fakeRegistry() });

      // Act
      const images = await resolve({ images: IMAGES, tag: "2.31.5" });

      // Assert
      expect(images).to.deep.equal([
        {
          key: "edgeport",
          name: "fonoster/routr-edgeport",
          tag: "2.31.5",
          digest: DIGEST.edgeport,
          ref: `fonoster/routr-edgeport:2.31.5@${DIGEST.edgeport}`
        },
        {
          key: "echo",
          name: "fonoster/routr-echo",
          tag: "2.31.5",
          digest: DIGEST.echo,
          ref: `fonoster/routr-echo:2.31.5@${DIGEST.echo}`
        }
      ]);
    });

    it("should name the missing image", async () => {
      // Arrange
      const resolve = createResolveImageDigests({
        registry: fakeRegistry({
          "fonoster/routr-edgeport:2.31.9": DIGEST.edgeport
        })
      });

      // Act
      const err = await resolve({ images: IMAGES, tag: "2.31.9" }).catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ImageNotFoundError);
      expect((err as ImageNotFoundError).ref).to.equal(
        "fonoster/routr-echo:2.31.9"
      );
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and ask the registry nothing", async () => {
      // Arrange
      const registry = fakeRegistry();
      const resolve = createResolveImageDigests({ registry });

      // Act
      const err = await resolve({ images: {}, tag: "" }).catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(registry.asked).to.deep.equal([]);
    });
  });
});
