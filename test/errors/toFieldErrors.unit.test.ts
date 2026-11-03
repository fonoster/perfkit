/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { z } from "zod/v4";
import { toFieldErrors } from "../../src/errors/index.js";

describe("toFieldErrors", () => {
  it("should sort by path, with indexes in numeric order", () => {
    // Arrange
    const schema = z.object({
      run: z.object({ commit: z.string() }),
      benchmarks: z.array(z.object({ id: z.string() }))
    });
    const items = Array.from({ length: 11 }, (_, i) =>
      i === 2 || i === 10 ? {} : { id: "x" }
    );

    // Act
    const result = schema.safeParse(
      { run: {}, benchmarks: items },
      { reportInput: true }
    );
    const fields = toFieldErrors(result.error?.issues ?? []).map(
      (e) => e.field
    );

    // Assert
    expect(fields).to.deep.equal([
      "benchmarks[2].id",
      "benchmarks[10].id",
      "run.commit"
    ]);
  });

  it("should give each unknown key its own error", () => {
    const result = z
      .strictObject({})
      .safeParse({ b: 1, a: 2 }, { reportInput: true });
    expect(toFieldErrors(result.error?.issues ?? [])).to.deep.equal([
      { field: "a", message: "unknown key", code: "unrecognized_keys" },
      { field: "b", message: "unknown key", code: "unrecognized_keys" }
    ]);
  });
});
