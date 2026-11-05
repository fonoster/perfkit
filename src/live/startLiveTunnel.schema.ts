/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const startLiveTunnelInputSchema = z.strictObject({
  /** NGROK_AUTHTOKEN; never logged. */
  token: z.string().min(1, { error: "expected an ngrok authtoken" }),
  /** The static ngrok domain, like perfkit.ngrok.app; none for a random one. */
  domain: z.string().min(1).nullable(),
  /** The local port of the live.json server. */
  port: z.number().int().min(1).max(65535)
});

export type StartLiveTunnelInput = z.infer<typeof startLiveTunnelInputSchema>;

/** The part of @ngrok/ngrok the tunnel uses. */
export type NgrokForward = (config: {
  addr: string;
  authtoken: string;
  domain?: string;
}) => Promise<{ url(): string | null; close(): Promise<void> }>;
