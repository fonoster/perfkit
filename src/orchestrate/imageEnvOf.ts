/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * One digest-pinned `PERFKIT_IMAGE_<NAME>` per image: `<NAME>` is the image
 * key in uppercase with every other character turned into `_`.
 */
export function imageEnvOf(
  images: ReadonlyArray<{ key: string; ref: string }>
): Record<string, string> {
  return Object.fromEntries(
    images.map((image) => [
      `PERFKIT_IMAGE_${image.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      image.ref
    ])
  );
}
