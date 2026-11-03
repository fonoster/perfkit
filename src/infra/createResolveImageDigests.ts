/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { ImageNotFoundError } from "./errors.js";
import {
  type ResolveImageDigestsInput,
  resolveImageDigestsInputSchema
} from "./infra.schema.js";
import type { RegistryClient, ResolvedImage } from "./types.js";

/**
 * Creates the function that pins every image of perfkit.yaml at one tag to
 * its digest, so a run uses exactly the images `--dry-run` showed.
 *
 * @param deps - The registry client (injected)
 * @returns A validated function; it throws ImageNotFoundError for a missing
 * tag, naming the first missing image in perfkit.yaml order
 */
export function createResolveImageDigests(deps: { registry: RegistryClient }) {
  const fn = async ({
    images,
    tag
  }: ResolveImageDigestsInput): Promise<ResolvedImage[]> => {
    const entries = Object.entries(images);
    const digests = await Promise.all(
      entries.map(([, name]) => deps.registry.getDigest(name, tag))
    );
    return entries.map(([key, name], index) => {
      const digest = digests[index];
      if (!digest) throw new ImageNotFoundError(`${name}:${tag}`);
      return { key, name, tag, digest, ref: `${name}:${tag}@${digest}` };
    });
  };

  return withErrorHandlingAndValidation(fn, resolveImageDigestsInputSchema);
}
