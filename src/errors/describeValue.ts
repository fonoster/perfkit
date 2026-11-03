/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Describes a value from a document for an error message: strings are quoted,
 * numbers, booleans and null are printed as they are, and arrays and objects
 * are named, never dumped.
 */
export function describeValue(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
