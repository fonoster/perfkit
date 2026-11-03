/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { capacityMetaSchema } from "../../src/analyze/index.js";
import { fileValidationError } from "../../src/analyze/fileValidationError.js";
import { parseJsonDocument } from "../../src/analyze/parseJsonDocument.js";
import { parseJsonLines } from "../../src/analyze/parseJsonLines.js";
import { ValidationError } from "../../src/errors/index.js";
import { samplerLineSchema } from "../../src/analyze/index.js";
import { readFixtureDir, thrown } from "./builders.js";

describe("parseJsonDocument", () => {
  describe("with valid input", () => {
    it("should parse and validate the fixture's meta.json", () => {
      // Act
      const meta = parseJsonDocument(
        readFixtureDir("sipp-edgeport-echo")["meta.json"] as string,
        "meta.json",
        capacityMetaSchema
      );

      // Assert
      expect(meta.steps.map((step) => step.offeredCps)).to.deep.equal([
        50, 100, 150
      ]);
      expect(meta.tool).to.equal("SIPp 3.7.3, UDP");
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError naming the file and field", () => {
      // Act
      const error = thrown(() =>
        parseJsonDocument(
          '{"kind":"capacity"}',
          "meta.json",
          capacityMetaSchema
        )
      );

      // Assert
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.message).to.match(/^meta\.json: /);
      expect(error.message).to.include("steps: required");
    });

    it("should throw an Error when the text is not JSON", () => {
      // Act
      const error = thrown(() =>
        parseJsonDocument("{", "meta.json", capacityMetaSchema)
      );

      // Assert
      expect(error.message).to.match(/^meta\.json: not JSON: /);
    });
  });
});

describe("parseJsonLines", () => {
  it("should throw an Error naming a line that is not JSON", () => {
    // Act
    const error = thrown(() =>
      parseJsonLines("{}\nnope\n", "x.jsonl", samplerLineSchema)
    );

    // Assert
    expect(error.message).to.equal("x.jsonl: line 2 is not JSON");
  });

  it("should return nothing for an empty file", () => {
    expect(parseJsonLines("\n", "x.jsonl", samplerLineSchema)).to.deep.equal(
      []
    );
  });
});

describe("fileValidationError", () => {
  it("should prefix the message with the file", () => {
    // Arrange
    const result = capacityMetaSchema.safeParse({}, { reportInput: true });
    if (result.success) throw new Error("unreachable");

    // Act
    const error = fileValidationError("meta.json", result.error);

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
    expect(error.message).to.match(/^meta\.json: durationS: required/);
    expect(error.fieldErrors.length).to.be.greaterThan(0);
  });
});
