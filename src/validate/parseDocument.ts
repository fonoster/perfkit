/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parse } from "yaml";

/**
 * Parses a document's text: JSON when the file name ends in `.json`, YAML
 * otherwise. Throws with the parser's reason when the text is malformed.
 */
export function parseDocument(text: string, fileName: string): unknown {
  return fileName.toLowerCase().endsWith(".json")
    ? JSON.parse(text)
    : parse(text);
}
