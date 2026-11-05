/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundles the browser app (`main` next to this file, as .ts from src or .js
 * from dist) into one minified script, with the perfkit version built in.
 * Needs esbuild, a dev dependency: `npm run build` writes the result to
 * `dist/app/app.js`, which the CLI ships.
 */
export async function bundleApp(version: string): Promise<string> {
  const { build } = await import("esbuild");
  const here = dirname(fileURLToPath(import.meta.url));
  const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const result = await build({
    entryPoints: [join(here, `main.${ext}`)],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    define: { __PERFKIT_VERSION__: JSON.stringify(version) },
    plugins: [
      {
        // Zod's translated messages are half the bundle and never used: the
        // app writes errors in English, from zod's own English locale.
        name: "zod-without-locales",
        setup(build) {
          build.onResolve({ filter: /\/locales\/index\.js$/ }, (args) =>
            /[/\\]zod[/\\]/.test(args.importer)
              ? { path: "zod-locales", namespace: "perfkit-empty" }
              : undefined
          );
          build.onLoad({ filter: /.*/, namespace: "perfkit-empty" }, () => ({
            contents: "export {};",
            loader: "js"
          }));
        }
      }
    ],
    logLevel: "silent"
  });
  const file = result.outputFiles[0];
  if (file === undefined) throw new Error("esbuild wrote no bundle");
  return file.text;
}
