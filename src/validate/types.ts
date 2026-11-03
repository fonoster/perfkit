/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { SchemaId } from "../schemas/index.js";

/** One problem in a document. `path` is null when it is about the file. */
export interface DocumentError {
  path: string | null;
  message: string;
}

export type ValidateFileResult =
  | { valid: true; format: SchemaId; summary: string }
  | { valid: false; format: SchemaId | null; errors: DocumentError[] };

/** File system access, injected so tests never touch the disk. */
export interface ValidateFileDeps {
  readFile: (path: string) => Promise<string>;
  /** True when the path exists and is a file. */
  isFile: (path: string) => Promise<boolean>;
}
