/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { type Live, liveSchema } from "../../schemas/index.js";

/** How many rounds of stripping unknown fields before giving up. */
const MAX_ROUNDS = 8;

/**
 * Parses a live.json the way the page needs it: a field this app does not
 * know, written by a newer perfkit, is left out instead of making the whole
 * file invalid, so a run in progress still shows. Anything else wrong with
 * the file (a missing or mistyped field, another schema id) is invalid,
 * as with `liveSchema` itself.
 *
 * @returns The live snapshot without the unknown fields, or null
 */
export function parseLiveTolerant(value: unknown, round = 0): Live | null {
  const parsed = liveSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const unknown = parsed.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys" ? [issue] : []
  );
  if (unknown.length === 0 || unknown.length !== parsed.error.issues.length) {
    return null;
  }
  if (round >= MAX_ROUNDS) return null;
  unknown.forEach(({ path, keys }) => {
    const holder = path.reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === "object"
          ? (node as Record<PropertyKey, unknown>)[key]
          : undefined,
      value
    );
    if (holder !== null && typeof holder === "object") {
      keys.forEach((key) => {
        delete (holder as Record<string, unknown>)[key];
      });
    }
  });
  return parseLiveTolerant(value, round + 1);
}
