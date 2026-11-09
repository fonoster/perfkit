/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

export interface RampStepState {
  /** False when the step's measurement does not count (load generator gave out). */
  valid: boolean;
  /** True when the step broke a rule (p99 or failed calls). */
  broken: boolean;
}

export interface RampEnd {
  /** Index of the step that ends the ramp, or -1 when none does. */
  endIndex: number;
  /** Indexes of the steps that broke a rule but were not confirmed. */
  spikes: number[];
}

/**
 * Where a capacity ramp ends. An invalid step ends it at once. A step that
 * breaks a rule ends it only when `confirmSteps` steps in a row break one
 * (the run starts at the first of them); a shorter run followed by a step
 * that passes is a spike: the ramp goes on and the steps are listed in
 * `spikes`. A run that reaches the last step counts as confirmed, and so does
 * a run when the ramp stopped for another reason than a passing step.
 *
 * @param steps - The steps in order
 * @param confirmSteps - How many consecutive steps must break a rule
 */
export function findRampEnd(
  steps: readonly RampStepState[],
  confirmSteps: number
): RampEnd {
  const spikes: number[] = [];
  const scan = (i: number): number => {
    const step = steps[i];
    if (!step) return -1;
    if (!step.valid) return i;
    if (!step.broken) return scan(i + 1);
    const runEnd = steps.findIndex(
      (next, index) => index > i && !(next.valid && next.broken)
    );
    const end = runEnd === -1 ? steps.length : runEnd;
    const runLength = end - i;
    const ranOut = end === steps.length;
    const passedAfter = !ranOut && steps[end]?.valid === true;
    if (runLength >= confirmSteps || ranOut) return i;
    if (passedAfter) {
      spikes.push(...Array.from({ length: runLength }, (_, k) => i + k));
      return scan(end);
    }
    // The run is cut by an invalid step, which ends the ramp
    return end;
  };
  return { endIndex: scan(0), spikes };
}
