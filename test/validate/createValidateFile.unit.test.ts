/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/index.js";
import { createValidateFile } from "../../src/validate/index.js";
import { loadReport, ROUTR_CONFIG } from "../fixtures.js";

describe("createValidateFile", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("with valid input", () => {
    it("should validate a perfkit.yaml and its paths", async () => {
      // Arrange
      const deps = {
        readFile: sinon.stub().resolves(readFileSync(ROUTR_CONFIG, "utf8")),
        isFile: sinon.stub().resolves(true)
      };

      // Act
      const result = await createValidateFile(deps)({
        file: "perf/perfkit.yaml"
      });

      // Assert
      expect(result).to.deep.equal({
        valid: true,
        format: "perfkit/v1",
        summary: "valid perfkit/v1 config, 2 benchmarks"
      });
      expect(deps.readFile).to.have.been.calledOnceWith("perf/perfkit.yaml");
      expect(deps.isFile.callCount).to.equal(10);
    });

    it("should return the errors of an invalid report", async () => {
      // Arrange
      const report = loadReport("passed");
      report.benchmarks[1].verdict = "ok";
      delete report.run.commit;
      const deps = {
        readFile: sinon.stub().resolves(JSON.stringify(report)),
        isFile: sinon.stub()
      };

      // Act
      const result = await createValidateFile(deps)({ file: "report.json" });

      // Assert
      expect(result).to.deep.equal({
        valid: false,
        format: "perfkit/report/v1",
        errors: [
          {
            path: "benchmarks[1].verdict",
            message:
              'expected one of passed, failed, inconclusive, aborted, not-run; got "ok"'
          },
          { path: "run.commit", message: "required" }
        ]
      });
      expect(deps.isFile.called).to.equal(false);
    });

    it("should report a file it cannot read", async () => {
      // Arrange
      const error = Object.assign(new Error("ENOENT: no such file"), {
        code: "ENOENT"
      });
      const deps = {
        readFile: sinon.stub().rejects(error),
        isFile: sinon.stub()
      };

      // Act
      const result = await createValidateFile(deps)({ file: "missing.json" });

      // Assert
      expect(result).to.deep.equal({
        valid: false,
        format: null,
        errors: [{ path: null, message: "cannot read: no such file" }]
      });
    });

    it("should report a file it cannot parse", async () => {
      // Arrange
      const deps = {
        readFile: sinon.stub().resolves("{"),
        isFile: sinon.stub()
      };

      // Act
      const result = await createValidateFile(deps)({ file: "report.json" });

      // Assert
      expect(result.valid).to.equal(false);
      expect(!result.valid && result.errors[0]?.message).to.match(
        /^cannot parse: /
      );
    });
  });

  describe("with invalid input", () => {
    it("should throw ValidationError when file is missing", async () => {
      // Arrange
      const deps = { readFile: sinon.stub(), isFile: sinon.stub() };
      const validateFile = createValidateFile(deps);

      // Act + Assert
      try {
        await validateFile({});
        expect.fail("expected ValidationError");
      } catch (err) {
        expect(err).to.be.instanceOf(ValidationError);
        expect(deps.readFile.called).to.equal(false);
      }
    });
  });
});
