/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import { createLoadConfig } from "../../src/validate/createLoadConfig.js";
import { loadReport, ROUTR_CONFIG } from "../fixtures.js";

describe("createLoadConfig", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should return the config with its defaults", async () => {
      // Arrange
      const deps = {
        readFile: sinon.stub().resolves(readFileSync(ROUTR_CONFIG, "utf8")),
        isFile: sinon.stub().resolves(true)
      };

      // Act
      const result = await createLoadConfig(deps)({ file: "perfkit.yaml" });

      // Assert
      expect(result.ok).to.equal(true);
      const { config } = result as Extract<typeof result, { ok: true }>;
      expect(config.infra.maxLifetime).to.equal("9h");
      expect(config.benchmarks[1]!.telemetry.sampleRatio).to.equal(0.01);
    });

    it("should reject a report given as a config", async () => {
      // Arrange
      const deps = {
        readFile: sinon.stub().resolves(JSON.stringify(loadReport("passed"))),
        isFile: sinon.stub().resolves(true)
      };

      // Act
      const result = await createLoadConfig(deps)({ file: "report.json" });

      // Assert
      expect(result).to.deep.equal({
        ok: false,
        errors: [
          {
            path: null,
            message:
              "expected a perfkit.yaml (apiVersion: perfkit/v1); got a perfkit/report/v1 file"
          }
        ]
      });
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError and read nothing", async () => {
      // Arrange
      const deps = { readFile: sinon.stub(), isFile: sinon.stub() };

      // Act
      const err = await createLoadConfig(deps)({ file: "" }).catch(
        (e: unknown) => e
      );

      // Assert
      expect(err).to.be.instanceOf(ValidationError);
      expect(deps.readFile.callCount).to.equal(0);
    });
  });
});
