/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeAnalyzeDeps } from "../../src/analyze/index.js";

describe("createNodeAnalyzeDeps", () => {
  it("should stream a file's lines through readLines", async () => {
    // Arrange
    const dir = mkdtempSync(join(tmpdir(), "perfkit-lines-"));
    const path = join(dir, "spans.jsonl");
    writeFileSync(path, '{"a":1}\r\n{"b":2}\n\n{"c":3}');
    const lines: string[] = [];

    try {
      // Act
      for await (const line of createNodeAnalyzeDeps().readLines!(path)) {
        lines.push(line);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // Assert
    expect(lines).to.deep.equal(['{"a":1}', '{"b":2}', "", '{"c":3}']);
  });
});
