/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { bundleApp } from "../../../src/render/app/bundleApp.js";

describe("bundleApp", () => {
  it("should bundle the app into one script with the version built in", async function () {
    this.timeout(20000);

    // Act
    const text = await bundleApp("4.5.6");

    // Assert
    expect(text).to.contain('"4.5.6"');
    expect(text).to.not.contain("__PERFKIT_VERSION__");
    expect(text).to.not.match(/\bimport\s*[{*"]|\brequire\(/);
  });
});
