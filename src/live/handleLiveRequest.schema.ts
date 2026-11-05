/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const liveRequestSchema = z.strictObject({
  method: z.string().min(1, { error: "expected an HTTP method" }),
  /** The request target, like `/live.json?t=1`. */
  url: z.string().min(1, { error: "expected a request target" }),
  /** The Origin header, or null without one. */
  origin: z.string().nullable()
});

export type LiveRequest = z.infer<typeof liveRequestSchema>;

export interface LiveResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
