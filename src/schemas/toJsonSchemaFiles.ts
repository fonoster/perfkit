/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { liveSchema } from "./live.schema.js";
import { perfkitConfigSchema } from "./perfkitConfig.schema.js";
import { reportSchema } from "./report.schema.js";
import { runsSchema } from "./runs.schema.js";

/**
 * The JSON Schema files perfkit ships, by file name under `schemas/`, with
 * their exact contents. `npm run schemas` writes them; a test checks that the
 * committed files match. perfkit.yaml uses the input side, so fields with a
 * default are optional, as they are when written by hand.
 */
export function toJsonSchemaFiles(): Record<string, string> {
  const files: Record<string, z.core.JSONSchema.BaseSchema> = {
    "perfkit-v1.schema.json": z.toJSONSchema(perfkitConfigSchema, {
      io: "input"
    }),
    "report-v1.schema.json": z.toJSONSchema(reportSchema),
    "runs-v1.schema.json": z.toJSONSchema(runsSchema),
    "live-v1.schema.json": z.toJSONSchema(liveSchema)
  };
  return Object.fromEntries(
    Object.entries(files).map(([name, schema]) => [
      name,
      `${JSON.stringify(schema, null, 2)}\n`
    ])
  );
}
