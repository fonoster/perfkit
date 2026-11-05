/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Part of `npm run build`: bundles the browser app into dist/app/app.js,
 * which `perfkit render` copies to the site as app/<version>/app.js.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleApp } from "../src/render/app/bundleApp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8")
) as { version: string };
const outDir = join(root, "dist", "app");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "app.js"), await bundleApp(version));
console.log("dist/app/app.js");
