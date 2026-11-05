/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { NODE_IMAGE } from "../tools.js";
import { shellJoin } from "../orchestrate/shellQuote.js";

/**
 * The command that adds @ngrok/ngrok's native binding for the agent's own
 * platform (Linux, musl, in NODE_IMAGE) to the staged agent package: the
 * CLI's machine has only its own binding. It installs the same version in
 * a throwaway prefix in NODE_IMAGE and copies the `@ngrok` scope over.
 * It always exits 0: without the binding the agent runs without a tunnel.
 */
export function ngrokBindingCommand(input: {
  agentDir: string;
  version: string;
}): string {
  const script = [
    "set -e",
    "npm install --silent --no-save --no-package-lock --ignore-scripts --no-audit --no-fund --prefix /tmp/ngrok " +
      shellJoin([`@ngrok/ngrok@${input.version}`]),
    `mkdir -p ${input.agentDir}/node_modules/@ngrok`,
    `cp -R /tmp/ngrok/node_modules/@ngrok/. ${input.agentDir}/node_modules/@ngrok/`
  ].join("; ");
  return `${shellJoin([
    "docker",
    "run",
    "--rm",
    "-v",
    `${input.agentDir}:${input.agentDir}`,
    NODE_IMAGE,
    "sh",
    "-c",
    script
  ])} >/dev/null 2>&1; true`;
}
