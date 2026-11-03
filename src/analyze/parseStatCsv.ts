/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { fileValidationError } from "./fileValidationError.js";
import type { StatRow, StatTrace } from "./types.js";

const REQUIRED_COUNTERS = [
  "OutgoingCall(P)",
  "FailedCall(P)",
  "Retransmissions(P)",
  "CurrentCall"
] as const;

const counterSchema = z
  .number({ error: "expected a number" })
  .nonnegative({ error: "must be 0 or more" });

const rowSchema = z.looseObject({
  StartTime: z.number({
    error: "expected a time like date<TAB>time<TAB>epoch"
  }),
  CurrentTime: z.number({
    error: "expected a time like date<TAB>time<TAB>epoch"
  }),
  ...Object.fromEntries(REQUIRED_COUNTERS.map((name) => [name, counterSchema]))
});

const statSchema = z
  .array(rowSchema)
  .min(1, { error: "expected at least one row after the header" });

/**
 * Parses a SIPp `-trace_stat` file (`<scenario>_<pid>_.csv`): semicolon
 * separated, a header row, then one row per `-fd` period. Times such as
 * `2026-11-03<TAB>20:04:44.960600<TAB>1793736284.960600` are read from their
 * epoch part; every other column that holds a plain number is kept as a
 * counter by its header name. Columns such as ElapsedTime or ResponseTime1,
 * written as `00:00:10:015000`, are dropped.
 */
export function parseStatCsv(text: string, file: string): StatTrace {
  const [headerLine = "", ...lines] = text
    .split("\n")
    .filter((line) => line.trim() !== "");
  const header = headerLine.split(";");
  const records = lines.map((line) => toRecord(header, line.split(";")));
  const result = statSchema.safeParse(records, { reportInput: true });
  if (!result.success) throw fileValidationError(file, result.error);

  const parsed = result.data as Array<Record<string, number>>;
  const rows = parsed.map<StatRow>((record, index) => {
    const tMs = record.CurrentTime ?? 0;
    const previous = index === 0 ? undefined : parsed[index - 1];
    return {
      tMs,
      periodStartMs: previous?.CurrentTime ?? tMs,
      counters: record
    };
  });
  return { startMs: parsed[0]?.StartTime ?? 0, rows };
}

function toRecord(header: string[], cells: string[]): Record<string, number> {
  return header.reduce<Record<string, number>>((record, name, index) => {
    if (name === "") return record;
    const value = parseCell(cells[index] ?? "");
    return value === undefined ? record : { ...record, [name]: value };
  }, {});
}

/** Epoch seconds become ms; plain numbers stay; anything else is dropped. */
function parseCell(cell: string): number | undefined {
  const parts = cell.split("\t");
  if (parts.length === 3) return epochToMs(parts[2] ?? "");
  if (!/^-?\d+(\.\d+)?$/.test(cell.trim())) return undefined;
  return Number(cell);
}

/** `1793736284.960600` to ms, without the float error of seconds × 1000. */
function epochToMs(epoch: string): number | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(epoch.trim());
  if (!match) return undefined;
  const fraction = Number(`0.${match[2] ?? "0"}`) * 1000;
  return Number(match[1]) * 1000 + Math.round(fraction * 1000) / 1000;
}
