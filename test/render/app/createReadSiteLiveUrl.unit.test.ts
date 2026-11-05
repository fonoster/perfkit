/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { createReadSiteLiveUrl } from "../../../src/render/app/createReadSiteLiveUrl.js";
import { reportSchema } from "../../../src/schemas/index.js";
import { loadReport } from "../../fixtures.js";

const project = reportSchema.parse(loadReport("passed")).project;
const site = (live?: string) =>
  JSON.stringify({
    schema: "perfkit/site/v1",
    project: { ...project, ...(live ? { live: { url: live } } : {}) }
  });

describe("createReadSiteLiveUrl", () => {
  it("should return the live URL in data/site.json", async () => {
    // Arrange
    const paths: string[] = [];
    const read = createReadSiteLiveUrl({
      fetchText: async (path) => {
        paths.push(path);
        return { status: 200, text: site("https://a.example/live.json") };
      }
    });

    // Act
    const url = await read();

    // Assert
    expect(url).to.equal("https://a.example/live.json");
    expect(paths).to.deep.equal(["data/site.json"]);
  });

  it("should be null with no live URL, no site.json, an invalid one or a network error", async () => {
    // Arrange
    const answers = [
      async () => ({ status: 200, text: site() }),
      async () => ({ status: 404, text: "Not Found" }),
      async () => ({ status: 200, text: "{" }),
      async () => ({ status: 200, text: JSON.stringify({ schema: "x" }) }),
      async () => {
        throw new Error("offline");
      }
    ];

    // Act
    const urls = await Promise.all(
      answers.map((fetchText) => createReadSiteLiveUrl({ fetchText })())
    );

    // Assert
    expect(urls).to.deep.equal([null, null, null, null, null]);
  });
});
