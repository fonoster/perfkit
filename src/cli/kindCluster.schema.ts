/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";

export const createKindClusterInputSchema = z.strictObject({
  /** `perfkit-<run id in lowercase>`. */
  name: z.string().regex(/^perfkit-\d{8}t\d{6}z-[0-9a-f]{7}$/, {
    error: "expected perfkit-<run id in lowercase>"
  }),
  runId: z.string().min(1),
  /** A private directory of this run, for the kubeconfig the tools use. */
  dir: z.string().regex(/^\//, { error: "expected an absolute path" }),
  /** Each helm benchmark's chart and rendered values, to list its images. */
  charts: z.array(
    z.strictObject({
      chart: z.string().regex(/^\//, { error: "expected an absolute path" }),
      values: z.string().regex(/^\//, { error: "expected an absolute path" })
    })
  ),
  /** The `images:` of perfkit.yaml as `name:tag`. */
  images: z.array(z.string().min(1))
});

export type CreateKindClusterInput = z.infer<
  typeof createKindClusterInputSchema
>;
