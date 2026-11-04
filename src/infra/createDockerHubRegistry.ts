/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { LookupError, messageOf } from "./errors.js";
import type { RegistryClient } from "./types.js";

const AUTH_URL = "https://auth.docker.io/token";
const REGISTRY_URL = "https://registry-1.docker.io/v2";
const TIMEOUT_MS = 30 * 1000;

/** Multi-arch indexes first, so the digest is the one `docker pull` uses. */
const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json"
].join(", ");

/**
 * Creates a Docker Hub client for the registry API: an anonymous pull token
 * from auth.docker.io, then a `HEAD` on the tag's manifest for its digest. A
 * `HEAD` does not count against Docker Hub's pull limit. No token needed.
 *
 * @param deps - The fetch to call Docker Hub with (injected)
 */
export function createDockerHubRegistry(deps: {
  fetch: typeof fetch;
}): RegistryClient {
  const call = async (url: string, init: RequestInit = {}) => {
    try {
      return await deps.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw new LookupError(`could not reach Docker Hub: ${messageOf(err)}`);
    }
  };

  return {
    getDigest: async (name, tag) => {
      const repo = name.includes("/") ? name : `library/${name}`;
      const auth = await call(
        `${AUTH_URL}?service=registry.docker.io&scope=repository:${repo}:pull`
      );
      if (!auth.ok) {
        throw new LookupError(
          `could not get a Docker Hub token for ${name}: HTTP ${auth.status}`
        );
      }
      const { token } = (await auth.json()) as { token?: string };
      const manifest = await call(
        `${REGISTRY_URL}/${repo}/manifests/${encodeURIComponent(tag)}`,
        {
          method: "HEAD",
          headers: {
            Authorization: `Bearer ${token ?? ""}`,
            Accept: MANIFEST_TYPES
          }
        }
      );
      // Docker Hub answers 401 for a repository that does not exist.
      if (manifest.status === 404 || manifest.status === 401) return null;
      if (!manifest.ok) {
        throw new LookupError(
          `could not read ${name}:${tag} from Docker Hub: HTTP ${manifest.status}`
        );
      }
      const digest = manifest.headers.get("docker-content-digest");
      if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
        throw new LookupError(
          `Docker Hub returned no digest for ${name}:${tag}`
        );
      }
      return digest;
    }
  };
}
