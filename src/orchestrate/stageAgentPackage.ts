/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { access, cp, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Copies the CLI's own package into `dest`: `dist/`, `package.json` and the
 * production dependencies, found by walking `dependencies` from
 * package.json through `node_modules` (hoisted, as npm installs them). The
 * agent runs exactly this, with no network install on the droplet.
 *
 * @returns The package version that was staged
 * @throws when dist/ is missing (perfkit not built) or a dependency is
 */
export async function stageAgentPackage(
  packageRoot: string,
  dest: string
): Promise<string> {
  const pkg = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8")
  ) as { version: string; dependencies?: Record<string, string> };
  await access(join(packageRoot, "dist", "cli.js")).catch(() => {
    throw new Error(
      `${packageRoot} has no dist/cli.js; build perfkit first (npm run build)`
    );
  });

  const closure = async (
    names: string[],
    seen: Set<string>
  ): Promise<Set<string>> => {
    const fresh = names.filter((name) => !seen.has(name));
    if (fresh.length === 0) return seen;
    fresh.forEach((name) => seen.add(name));
    const next = await Promise.all(
      fresh.map(async (name) => {
        const file = join(packageRoot, "node_modules", name, "package.json");
        const text = await readFile(file, "utf8").catch(() => {
          throw new Error(
            `dependency ${name} is not installed in ${packageRoot}`
          );
        });
        return Object.keys(
          (JSON.parse(text) as { dependencies?: Record<string, string> })
            .dependencies ?? {}
        );
      })
    );
    return closure(next.flat(), seen);
  };
  const deps = await closure(Object.keys(pkg.dependencies ?? {}), new Set());

  await cp(join(packageRoot, "dist"), join(dest, "dist"), { recursive: true });
  await cp(join(packageRoot, "package.json"), join(dest, "package.json"));
  await Promise.all(
    [...deps].map((name) =>
      cp(
        join(packageRoot, "node_modules", name),
        join(dest, "node_modules", name),
        {
          recursive: true
        }
      )
    )
  );
  return pkg.version;
}
