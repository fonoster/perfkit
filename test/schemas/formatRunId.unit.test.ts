/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { formatRunId } from "../../src/schemas/index.js";

describe("formatRunId", () => {
  it("should join startedAt as YYYYMMDDTHHMMSSZ and the first 7 of commit", () => {
    expect(formatRunId("2026-11-03T14:12:10Z", "bd3254a4f3e1")).to.equal(
      "20261103T141210Z-bd3254a"
    );
  });

  it("should drop fractional seconds", () => {
    expect(formatRunId("2026-11-03T14:12:10.987Z", "bd3254a")).to.equal(
      "20261103T141210Z-bd3254a"
    );
  });
});
