/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageAgentPackage } from "../../src/orchestrate/stageAgentPackage.js";

const pkgJson = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, version: "1.0.0", dependencies: deps });

async function writePackage(
  dir: string,
  name: string,
  deps?: Record<string, string>
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), pkgJson(name, deps));
  await writeFile(join(dir, "index.js"), `module.exports = "${name}";`);
}

describe("stageAgentPackage", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "perfkit-stage-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writePerfkit(dir: string): Promise<void> {
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist", "cli.js"), "// cli");
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "perfkit",
        version: "0.1.2",
        dependencies: { commander: "^14", yaml: "^2" }
      })
    );
  }

  it("should stage dependencies installed inside the package", async () => {
    const pkg = join(root, "perfkit");
    await writePerfkit(pkg);
    await writePackage(join(pkg, "node_modules", "commander"), "commander");
    await writePackage(join(pkg, "node_modules", "yaml"), "yaml");
    const dest = join(root, "out");

    const version = await stageAgentPackage(pkg, dest);

    expect(version).to.equal("0.1.2");
    expect(
      await readFile(join(dest, "node_modules", "yaml", "index.js"), "utf8")
    ).to.contain("yaml");
  });

  it("should stage dependencies hoisted beside the package, as npx installs them", async () => {
    // npx: <cache>/node_modules/perfkit with commander, yaml and yaml's own
    // dependency hoisted to <cache>/node_modules
    const cache = join(root, "_npx", "abc");
    const pkg = join(cache, "node_modules", "perfkit");
    await writePerfkit(pkg);
    await writePackage(join(cache, "node_modules", "commander"), "commander");
    await writePackage(join(cache, "node_modules", "yaml"), "yaml", {
      "yaml-dep": "^1"
    });
    await writePackage(join(cache, "node_modules", "yaml-dep"), "yaml-dep");
    const dest = join(root, "out");

    await stageAgentPackage(pkg, dest);

    expect(
      await readFile(
        join(dest, "node_modules", "commander", "index.js"),
        "utf8"
      )
    ).to.contain("commander");
    expect(
      await readFile(join(dest, "node_modules", "yaml-dep", "index.js"), "utf8")
    ).to.contain("yaml-dep");
    expect(await readFile(join(dest, "dist", "cli.js"), "utf8")).to.contain(
      "cli"
    );
  });

  it("should name a dependency that is installed nowhere", async () => {
    const pkg = join(root, "perfkit");
    await writePerfkit(pkg);
    await writePackage(join(pkg, "node_modules", "commander"), "commander");

    const error = await stageAgentPackage(pkg, join(root, "out")).catch(
      (e: Error) => e
    );

    expect((error as Error).message).to.contain(
      "dependency yaml is not installed"
    );
  });
});
