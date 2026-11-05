/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * At most `max` items of `items`, evenly spaced, always keeping the first
 * and the last, in order. Fewer items come back as they are.
 */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 1) return items.slice(-1);
  const step = (items.length - 1) / (max - 1);
  return Array.from(
    { length: max },
    (_, i) => items[Math.round(i * step)] as T
  );
}
