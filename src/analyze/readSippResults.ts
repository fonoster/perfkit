/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { basename, join } from "node:path";
import { parseRttCsv } from "./parseRttCsv.js";
import { parseStatCsv } from "./parseStatCsv.js";
import type { AnalyzeDeps, Call, SippResults } from "./types.js";

/** The rtd perfkit measures: the one a scenario starts with start_rtd="1". */
export const MEASURED_RTD = 1;

/**
 * Reads what one scenario's SIPp instances wrote in the raw results
 * directory. SIPp names its files after the scenario file without .xml:
 * `<scenario>_<pid>_.csv` (-trace_stat) and `<scenario>_<pid>_rtt.csv`
 * (-trace_rtt). Every pid's files are read and merged. A call's send time is
 * SIPp's StartTime plus the rtt row's time minus its response time.
 *
 * @returns null when the scenario left no stat file
 */
export async function readSippResults(
  deps: AnalyzeDeps,
  rawDir: string,
  names: readonly string[],
  scenario: string
): Promise<SippResults | null> {
  const base = basename(scenario).replace(/\.xml$/i, "");
  const pids = names
    .map((name) => matchStatFile(name, base))
    .filter((pid): pid is string => pid !== null)
    .sort();
  if (pids.length === 0) return null;
  const perPid = await Promise.all(
    pids.map(async (pid) => {
      const statFile = `${base}_${pid}_.csv`;
      const rttFile = `${base}_${pid}_rtt.csv`;
      const stat = parseStatCsv(
        await deps.readFile(join(rawDir, statFile)),
        statFile
      );
      const rows = names.includes(rttFile)
        ? parseRttCsv(await deps.readFile(join(rawDir, rttFile)), rttFile)
        : [];
      const calls = rows
        .filter((row) => row.rtd === MEASURED_RTD)
        .map<Call>((row) => ({
          sentMs: stat.startMs + row.atMs - row.responseTimeMs,
          latencyMs: row.responseTimeMs
        }));
      return {
        rows: stat.rows.map((row) => ({ ...row, pid })),
        calls
      };
    })
  );
  return {
    rows: perPid.flatMap((results) => results.rows),
    calls: perPid.flatMap((results) => results.calls)
  };
}

function matchStatFile(name: string, base: string): string | null {
  if (!name.startsWith(`${base}_`) || !name.endsWith("_.csv")) return null;
  const pid = name.slice(base.length + 1, -"_.csv".length);
  return /^\d+$/.test(pid) ? pid : null;
}
