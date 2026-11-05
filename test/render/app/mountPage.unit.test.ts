/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { JSDOM } from "jsdom";
import { mountPage } from "../../../src/render/app/mountPage.js";
import { showErrors } from "../../../src/render/app/showErrors.js";

const PAGE = `<!doctype html>
<html lang="en"><head><title>Page</title><style>p{color:red}</style></head>
<body><p class="x">hi</p><script>window.ran = (window.ran || 0) + 1;</script></body></html>`;

describe("mountPage", () => {
  it("should replace the shell with the page and run its script once", () => {
    // Arrange
    const dom = new JSDOM("<!doctype html><title>Shell</title><p>shell</p>", {
      runScripts: "dangerously"
    });

    // Act
    mountPage(dom.window.document, PAGE);

    // Assert
    expect(dom.window.document.documentElement.outerHTML).to.equal(
      new JSDOM(PAGE).window.document.documentElement.outerHTML
    );
    expect(dom.window.document.title).to.equal("Page");
    expect((dom.window as unknown as { ran: number }).ran).to.equal(1);
  });
});

describe("showErrors", () => {
  it("should put the error lines in the body as an alert", () => {
    // Arrange
    const dom = new JSDOM("<!doctype html><p>shell</p>");

    // Act
    showErrors(dom.window.document, ["a: <b>", "c"]);

    // Assert
    const alert = dom.window.document.querySelector("[role=alert]");
    expect(alert?.querySelector("pre")?.textContent).to.equal("a: <b>\nc");
    expect(dom.window.document.body.children).to.have.length(1);
  });
});
