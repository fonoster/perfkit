/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type RunEntry, runsSchema } from "../../../src/schemas/index.js";
import { EXAMPLES } from "../../fixtures.js";

/** The 14-run Routr history; its newest run held edgeport-echo at 1,240/s. */
export const HISTORY: RunEntry[] = runsSchema.parse(
  JSON.parse(readFileSync(join(EXAMPLES, "history", "runs-14.json"), "utf8"))
).runs;
