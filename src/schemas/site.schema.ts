/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * `data/site.json`, `schema: perfkit/site/v1`: the project the benchmarks
 * site belongs to, as report.json carries it. `perfkit render` writes it
 * with or without a report, so the app can draw a site with no runs yet and
 * find the live.json URL before the first run is published.
 */
import { z } from "zod/v4";
import { reportProjectSchema } from "./report.schema.js";

export const SITE_SCHEMA_ID = "perfkit/site/v1";

export const siteSchema = z
  .strictObject({
    schema: z.literal(SITE_SCHEMA_ID),
    project: reportProjectSchema
  })
  .meta({
    title: "site.json v1",
    description:
      "The project of a perfkit benchmarks site: its name, branding and live.json URL (schema: perfkit/site/v1)."
  });

export type Site = z.infer<typeof siteSchema>;
