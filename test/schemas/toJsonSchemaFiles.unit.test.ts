/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toJsonSchemaFiles } from "../../src/schemas/index.js";
import { ROOT } from "../fixtures.js";

describe("toJsonSchemaFiles", () => {
  const files = toJsonSchemaFiles();

  it("should write the five v1 schema files", () => {
    expect(Object.keys(files).sort()).to.deep.equal([
      "live-v1.schema.json",
      "perfkit-v1.schema.json",
      "report-v1.schema.json",
      "runs-v1.schema.json",
      "site-v1.schema.json"
    ]);
  });

  it("should match the committed schemas/*.schema.json (run npm run schemas)", () => {
    // Arrange
    const committed = readdirSync(join(ROOT, "schemas")).sort();

    // Assert
    expect(committed).to.deep.equal(Object.keys(files).sort());
    Object.entries(files).forEach(([name, contents]) => {
      expect(
        readFileSync(join(ROOT, "schemas", name), "utf8"),
        `schemas/${name} drifted; run npm run schemas`
      ).to.equal(contents);
    });
  });

  it("should leave defaulted perfkit.yaml fields optional", () => {
    // Arrange
    const schema = JSON.parse(files["perfkit-v1.schema.json"] ?? "{}");

    // Assert
    expect(schema.required).to.deep.equal([
      "apiVersion",
      "project",
      "infra",
      "images",
      "benchmarks"
    ]);
    expect(schema.properties.infra.required).to.deep.equal([
      "region",
      "uut",
      "loadgen"
    ]);
    expect(schema.additionalProperties).to.equal(false);
  });
});
