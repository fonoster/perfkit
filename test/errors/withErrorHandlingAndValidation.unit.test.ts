/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import sinon from "sinon";
import { z } from "zod/v4";
import {
  ValidationError,
  withErrorHandlingAndValidation
} from "../../src/errors/index.js";

describe("withErrorHandlingAndValidation", () => {
  const schema = z.strictObject({ file: z.string() });

  afterEach(() => {
    sinon.restore();
  });

  it("should call the function with the parsed input", async () => {
    // Arrange
    const fn = sinon.stub().resolves("done");

    // Act
    const result = await withErrorHandlingAndValidation(
      fn,
      schema
    )({ file: "a" });

    // Assert
    expect(result).to.equal("done");
    expect(fn).to.have.been.calledOnceWith({ file: "a" });
  });

  it("should throw ValidationError and never call the function", async () => {
    // Arrange
    const fn = sinon.stub().resolves("done");

    // Act + Assert
    try {
      await withErrorHandlingAndValidation(fn, schema)({ file: 1 });
      expect.fail("expected ValidationError");
    } catch (err) {
      expect(err).to.be.instanceOf(ValidationError);
      expect((err as ValidationError).fieldErrors).to.deep.equal([
        {
          field: "file",
          message: "expected string; got 1",
          code: "invalid_type"
        }
      ]);
      expect((err as ValidationError).message).to.equal(
        "file: expected string; got 1"
      );
      expect(fn.called).to.equal(false);
    }
  });
});
