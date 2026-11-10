/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/** Above this many points, an evenly spaced subset is used. */
export const THEIL_SEN_MAX_POINTS = 600;

/**
 * The Theil–Sen slope of y against x: the median of the slopes of every pair
 * of points with different x. A dip or a spike moves it far less than a
 * least-squares fit. Above `THEIL_SEN_MAX_POINTS` points it uses that many,
 * evenly spaced, so it stays fast (at most about 180,000 pairs). 0 with
 * fewer than two distinct x.
 */
export function theilSenSlope(
  points: ReadonlyArray<{ x: number; y: number }>
): number {
  const step = Math.max(1, points.length / THEIL_SEN_MAX_POINTS);
  const used =
    step === 1
      ? points
      : Array.from(
          { length: THEIL_SEN_MAX_POINTS },
          (_, i) => points[Math.floor(i * step)] as { x: number; y: number }
        );
  const slopes = used.flatMap((a, i) =>
    used
      .slice(i + 1)
      .filter((b) => b.x !== a.x)
      .map((b) => (b.y - a.y) / (b.x - a.x))
  );
  if (slopes.length === 0) return 0;
  const sorted = Float64Array.from(slopes).sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
