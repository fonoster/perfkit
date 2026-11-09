/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/** Every distinct `image:` of rendered Kubernetes manifests, in order. */
export function imagesOfManifests(yaml: string): string[] {
  const images = yaml
    .split("\n")
    .map((line) => /^\s*(?:-\s*)?image:\s*["']?([^"'\s#]+)/.exec(line)?.[1])
    .filter((image): image is string => image !== undefined && image !== "");
  return [...new Set(images)];
}
