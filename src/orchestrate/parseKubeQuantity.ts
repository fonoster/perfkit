/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
const SUFFIXES: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4
};

/**
 * A Kubernetes quantity as a number: `250m` cores is 0.25, `123456789n` is
 * 0.123456789, `1Ki` bytes is 1024. Null when it is not a quantity.
 */
export function parseKubeQuantity(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([a-zA-Z]{0,2})$/.exec(text.trim());
  if (!match) return null;
  const factor = SUFFIXES[match[2] ?? ""];
  return factor === undefined ? null : Number(match[1]) * factor;
}
