/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ROUTR_CONFIG } from "../fixtures.js";

const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const CLI = join(ROOT, "src", "cli.ts");

describe("cli entry point", function () {
  this.timeout(20000);

  it("should print the version in package.json", () => {
    // Arrange
    const { version } = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8")
    );

    // Act
    const out = execFileSync(TSX, [CLI, "--version"], { encoding: "utf8" });

    // Assert
    expect(out).to.equal(`${version}\n`);
  });

  it("should set the exit code from validate", () => {
    // Act
    const valid = spawnSync(TSX, [CLI, "validate", ROUTR_CONFIG], {
      encoding: "utf8"
    });
    const missing = spawnSync(TSX, [CLI, "validate", "missing.json"], {
      encoding: "utf8",
      cwd: ROOT
    });

    // Assert
    expect(valid.status).to.equal(0);
    expect(valid.stdout).to.equal(
      `${ROUTR_CONFIG}: valid perfkit/v1 config, 2 benchmarks\n`
    );
    expect(missing.status).to.equal(2);
    expect(missing.stderr).to.equal(
      "missing.json: cannot read: no such file\n"
    );
  });
});
