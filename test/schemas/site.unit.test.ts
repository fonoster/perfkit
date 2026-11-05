/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { reportSchema, siteSchema } from "../../src/schemas/index.js";
import { loadReport } from "../fixtures.js";

const project = reportSchema.parse(loadReport("passed")).project;

describe("siteSchema", () => {
  it("should accept a report's project", () => {
    // Arrange
    const site = {
      schema: "perfkit/site/v1",
      project: { ...project, live: { url: "https://a.example/live.json" } }
    };

    // Act
    const result = siteSchema.safeParse(site);

    // Assert
    expect(result.success).to.equal(true);
  });

  it("should reject another schema, a missing project or an unknown field", () => {
    // Act
    const results = [
      { schema: "perfkit/runs/v1", project },
      { schema: "perfkit/site/v1" },
      { schema: "perfkit/site/v1", project, runs: [] },
      { schema: "perfkit/site/v1", project: { ...project, accent: "teal" } }
    ].map((site) => siteSchema.safeParse(site).success);

    // Assert
    expect(results).to.deep.equal([false, false, false, false]);
  });
});
