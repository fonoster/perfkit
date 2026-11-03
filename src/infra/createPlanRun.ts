/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { formatRunId } from "../schemas/index.js";
import {
  DROPLET_IMAGE,
  PERFKIT_TAG,
  resourceNameOf,
  runTagOf
} from "./constants.js";
import { planRunInputSchema } from "./infra.schema.js";
import type { Plan, ResolvedImage } from "./types.js";

/**
 * Creates `planRun`: it decides everything a run will create, without
 * creating anything and without calling DigitalOcean. It pins the images to
 * their digests and looks up this machine's public IP for the SSH rule.
 *
 * @param deps - The digest resolver and the public IP lookup (injected)
 * @returns A validated function that returns the run's Plan
 */
export function createPlanRun(deps: {
  resolveImageDigests: (input: {
    images: Record<string, string>;
    tag: string;
  }) => Promise<ResolvedImage[]>;
  getPublicIp: () => Promise<string>;
}) {
  const fn = async (
    input: z.output<typeof planRunInputSchema>
  ): Promise<Plan> => {
    const { config, targetVersion, commit, startedAt } = input;
    const runId = formatRunId(startedAt, commit);
    const runTag = runTagOf(runId);
    const selected = input.benchmarks
      ? config.benchmarks.filter(({ id }) => input.benchmarks?.includes(id))
      : config.benchmarks;
    const [images, ip] = await Promise.all([
      deps.resolveImageDigests({ images: config.images, tag: targetVersion }),
      deps.getPublicIp()
    ]);
    return {
      runId,
      project: config.project.name,
      targetVersion,
      commit,
      startedAt,
      region: config.infra.region,
      resourceName: resourceNameOf(runId),
      runTag,
      tags: [PERFKIT_TAG, runTag],
      uut: {
        role: "uut",
        name: `perfkit-${runId}-uut`,
        size: config.infra.uut.size,
        image: DROPLET_IMAGE
      },
      loadgen: {
        role: "loadgen",
        name: `perfkit-${runId}-loadgen`,
        size: config.infra.loadgen.size,
        image: DROPLET_IMAGE
      },
      sshSource: `${ip}/32`,
      images,
      benchmarks: selected,
      maxLifetime: config.infra.maxLifetime
    };
  };

  return withErrorHandlingAndValidation(fn, planRunInputSchema);
}
