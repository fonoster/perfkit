/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `npm run schemas`: writes schemas/*.schema.json from the Zod schemas.
 * Commit the result; a unit test fails when the files drift.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toJsonSchemaFiles } from "../src/schemas/index.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
mkdirSync(outDir, { recursive: true });
Object.entries(toJsonSchemaFiles()).forEach(([name, contents]) => {
  writeFileSync(join(outDir, name), contents);
  console.log(`schemas/${name}`);
});
