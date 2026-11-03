/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { fileValidationError } from "./fileValidationError.js";
import type { RttRow } from "./types.js";

const HEADER = "Date_ms;response_time_ms;rtd_no";

const rowSchema = z.strictObject({
  atMs: z.number({ error: "expected a number" }).nonnegative(),
  responseTimeMs: z.number({ error: "expected a number" }).nonnegative(),
  rtd: z.number({ error: "expected a number" }).int().positive()
});

const fileSchema = z.strictObject({
  header: z.literal(HEADER, { error: `expected the header ${HEADER}` }),
  rows: z.array(rowSchema)
});

/**
 * Parses a SIPp `-trace_rtt` file (`<scenario>_<pid>_rtt.csv`). SIPp 3.7
 * writes `Date_ms;response_time_ms;rtd_no`: when the rtd stopped, in ms since
 * SIPp started (the stat file's StartTime), the rtd's time in ms, and the rtd
 * number. One row per call and rtd.
 */
export function parseRttCsv(text: string, file: string): RttRow[] {
  const [header = "", ...lines] = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const rows = lines.map((line) => {
    const [atMs, responseTimeMs, rtd] = line.split(";").map(toNumber);
    return { atMs, responseTimeMs, rtd };
  });
  const result = fileSchema.safeParse(
    { header: header.replace(/;$/, ""), rows },
    { reportInput: true }
  );
  if (!result.success) throw fileValidationError(file, result.error);
  return result.data.rows;
}

function toNumber(cell: string): number | string {
  const value = Number(cell);
  return cell.trim() !== "" && Number.isFinite(value) ? value : cell;
}
