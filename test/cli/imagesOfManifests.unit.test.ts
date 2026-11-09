/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { imagesOfManifests } from "../../src/cli/imagesOfManifests.js";

describe("imagesOfManifests", () => {
  it("should list every distinct image, quoted or not, in order", () => {
    const yaml = [
      "containers:",
      "  - name: a",
      "    image: routr-connect:m4-load",
      '  - image: "docker.io/bitnami/postgresql:15.1.0"',
      "    image: routr-connect:m4-load",
      "initContainers:",
      "  - image: 'busybox:1.36' # init",
      "imagePullPolicy: Never"
    ].join("\n");
    expect(imagesOfManifests(yaml)).to.deep.equal([
      "routr-connect:m4-load",
      "docker.io/bitnami/postgresql:15.1.0",
      "busybox:1.36"
    ]);
  });

  it("should return nothing for manifests without images", () => {
    expect(imagesOfManifests("kind: Service\n")).to.deep.equal([]);
  });
});
