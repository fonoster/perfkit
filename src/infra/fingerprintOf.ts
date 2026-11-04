/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { createHash } from "node:crypto";

/**
 * The MD5 fingerprint of a public key in authorized_keys format, the way
 * DigitalOcean names keys: `3b:16:bf:...`, 16 colon-separated hex bytes.
 */
export function fingerprintOf(publicKey: string): string {
  const blob = publicKey.trim().split(/\s+/)[1];
  if (!blob) throw new Error("expected a public key like ssh-ed25519 AAAA...");
  const digest = createHash("md5")
    .update(Buffer.from(blob, "base64"))
    .digest("hex");
  return digest.match(/../g)!.join(":");
}
