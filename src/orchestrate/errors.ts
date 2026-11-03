/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * A failure that ends the whole run with exit 3: the UUT never came up, the
 * setup script failed, or SIPp could not start. The message is one clause.
 */
export class AgentFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentFailure";
  }
}

/** The last non-empty line of a command's output, for an error message. */
export function lastLine(text: string, fallback: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .at(-1) ?? fallback
  );
}
