/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The @ngrok/ngrok version perfkit's package.json depends on, exactly. */
export async function ngrokVersion(packageRoot: string): Promise<string> {
  const pkg = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8")
  ) as { dependencies?: Record<string, string> };
  return (pkg.dependencies?.["@ngrok/ngrok"] ?? "latest").replace(/^[\^~]/, "");
}
