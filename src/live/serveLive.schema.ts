/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const serveLiveInputSchema = z.strictObject({
  /** The project's site; its origin may read live.json. */
  siteUrl: z.string().min(1),
  port: z.number().int().min(0).max(65535),
  host: z.string().min(1),
  /** NGROK_AUTHTOKEN, or null: no tunnel, this machine only. */
  token: z.string().min(1).nullable(),
  /** The static ngrok domain, or null. */
  domain: z.string().min(1).nullable()
});

export type ServeLiveInput = z.infer<typeof serveLiveInputSchema>;
