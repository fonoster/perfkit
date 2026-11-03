/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { execFile } from "node:child_process";
import type { RunProgram } from "./createSshTools.js";

/**
 * Runs a local program with no shell and resolves with its exit code and
 * output. A program that can't start, or runs past the timeout, resolves
 * with code 255, the code `ssh` uses for its own failures.
 */
export const runProgram: RunProgram = (file, args, { timeoutMs, signal }) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: timeoutMs,
        signal,
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8"
      },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 255;
        resolve({
          code,
          stdout,
          stderr: stderr || (error && code === 255 ? error.message : "")
        });
      }
    );
  });
