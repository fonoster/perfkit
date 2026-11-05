/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import {
  type NgrokForward,
  type StartLiveTunnelInput,
  startLiveTunnelInputSchema
} from "./startLiveTunnel.schema.js";

/**
 * Creates `startLiveTunnel`: an ngrok tunnel, with the official
 * @ngrok/ngrok package, from the static domain to the live.json server on
 * this machine. Returns its public URL and a close.
 *
 * @param deps - ngrok's `forward` (injected; tests pass a fake)
 */
export function createStartLiveTunnel(deps: { forward: NgrokForward }) {
  const fn = async ({ token, domain, port }: StartLiveTunnelInput) => {
    const listener = await deps.forward({
      addr: `127.0.0.1:${port}`,
      authtoken: token,
      ...(domain ? { domain } : {})
    });
    return {
      url: listener.url() ?? (domain ? `https://${domain}` : ""),
      close: () => listener.close()
    };
  };
  return withErrorHandlingAndValidation(fn, startLiveTunnelInputSchema);
}
