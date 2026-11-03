/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * How many users a register scenario has registered, from the last row of
 * its SIPp `-trace_counts` file (`<scenario>_<pid>_counts.csv`): the highest
 * `<index>_200_Recv` counter. The scenario registers each user once before
 * its first refresh, so the counter reaches the number of users when every
 * one of them has had a 200 OK.
 *
 * @param countsCsv - The counts file; `;`-separated, a header line first
 * @returns 0 when the file has no data row or no 200 counter
 */
export function countRegistered(countsCsv: string): number {
  const lines = countsCsv.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) return 0;
  const header = (lines[0] as string).split(";");
  const last = (lines.at(-1) as string).split(";");
  return header.reduce(
    (max, name, index) =>
      /^\d+_200_Recv$/.test(name.trim())
        ? Math.max(max, Number(last[index]) || 0)
        : max,
    0
  );
}
