/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { DeleteFailure } from "./types.js";

/**
 * The stderr line for a delete that failed, without the `perfkit: ` prefix:
 * `could not delete droplet 512034567 (perfkit-...-uut) after 3 attempts:
 * <message>. Run: perfkit sweep --run <run id>`.
 */
export function formatDeleteFailure(
  failure: DeleteFailure,
  runId: string
): string {
  return `could not delete ${failure.kind} ${failure.id} (${failure.name}) ${failure.reason}. Run: perfkit sweep --run ${runId}`;
}
