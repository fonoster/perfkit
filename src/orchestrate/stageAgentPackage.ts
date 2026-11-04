/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { access, cp, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Where `name` is installed for code in `from`, the way Node resolves it: the
 * nearest `node_modules/<name>` in `from` or any parent directory. Under npx
 * the dependencies sit beside the package, not inside it.
 */
async function findPackageDir(
  name: string,
  from: string
): Promise<string | null> {
  const candidate = join(from, "node_modules", name);
  const found = await access(join(candidate, "package.json"))
    .then(() => true)
    .catch(() => false);
  if (found) return candidate;
  const parent = dirname(from);
  return parent === from ? null : findPackageDir(name, parent);
}

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

  // name -> the directory it is installed in
  const closure = async (
    names: string[],
    seen: Map<string, string>
  ): Promise<Map<string, string>> => {
    const fresh = [...new Set(names)].filter((name) => !seen.has(name));
    if (fresh.length === 0) return seen;
    const next = await Promise.all(
      fresh.map(async (name) => {
        const dir = await findPackageDir(name, packageRoot);
        if (!dir) {
          throw new Error(
            `dependency ${name} is not installed in ${packageRoot} or any parent node_modules`
          );
        }
        seen.set(name, dir);
        const text = await readFile(join(dir, "package.json"), "utf8");
        return Object.keys(
          (JSON.parse(text) as { dependencies?: Record<string, string> })
            .dependencies ?? {}
        );
      })
    );
    return closure(next.flat(), seen);
  };
  const deps = await closure(Object.keys(pkg.dependencies ?? {}), new Map());

  await cp(join(packageRoot, "dist"), join(dest, "dist"), { recursive: true });
  await cp(join(packageRoot, "package.json"), join(dest, "package.json"));
  await Promise.all(
    [...deps].map(([name, dir]) =>
      cp(dir, join(dest, "node_modules", name), { recursive: true })
    )
  );
  return pkg.version;
}
