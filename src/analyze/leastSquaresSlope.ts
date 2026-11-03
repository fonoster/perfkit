/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * The least-squares slope of y against x. 0 with fewer than two points or
 * when every x is the same.
 */
export function leastSquaresSlope(
  points: ReadonlyArray<{ x: number; y: number }>
): number {
  const n = points.length;
  if (n < 2) return 0;
  const meanX = points.reduce((sum, { x }) => sum + x, 0) / n;
  const meanY = points.reduce((sum, { y }) => sum + y, 0) / n;
  const sxy = points.reduce(
    (sum, { x, y }) => sum + (x - meanX) * (y - meanY),
    0
  );
  const sxx = points.reduce((sum, { x }) => sum + (x - meanX) ** 2, 0);
  return sxx === 0 ? 0 : sxy / sxx;
}
