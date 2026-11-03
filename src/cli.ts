#!/usr/bin/env node
/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { runCli } from "./cli/runCli.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

process.exitCode = await runCli(process.argv, {
  version,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: (path) => readFile(path, "utf8"),
  isFile: (path) =>
    stat(path).then(
      (stats) => stats.isFile(),
      () => false
    ),
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  },
  fetchText: async (url) => {
    const response = await fetch(url, { redirect: "follow" });
    return { status: response.status, text: await response.text() };
  }
});
