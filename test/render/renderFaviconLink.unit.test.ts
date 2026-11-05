/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { renderFaviconLink } from "../../src/render/renderFaviconLink.js";

describe("renderFaviconLink", () => {
  it("should link the SVG as a URL-encoded data URI on its own line", () => {
    expect(renderFaviconLink('<svg a="1"/>')).to.equal(
      '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20a%3D%221%22%2F%3E">\n'
    );
  });

  it("should be empty without a favicon", () => {
    expect(renderFaviconLink(undefined)).to.equal("");
  });
});
