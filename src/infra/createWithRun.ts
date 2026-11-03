/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { z } from "zod/v4";
import { withErrorHandlingAndValidation } from "../errors/index.js";
import { ProvisionError } from "./errors.js";
import { type WithRunOptions, withRunInputSchema } from "./infra.schema.js";
import type {
  Plan,
  ProvisionedRun,
  RunContext,
  RunOutcome,
  RunResources,
  SignalSource,
  TeardownResult
} from "./types.js";

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
const NOTHING: TeardownResult = { deleted: [], failures: [] };

export interface WithRunDeps {
  provision: (
    plan: Plan,
    options: { authorizedKeys: string[]; signal: AbortSignal }
  ) => Promise<ProvisionedRun>;
  teardown: (resources: RunResources) => Promise<TeardownResult>;
  /** Where SIGINT and SIGTERM come from; `process` by default. */
  signals?: SignalSource;
}

/**
 * Creates `withRun(plan, body, { authorizedKeys })`: it provisions the run,
 * calls `body` with the provisioned run, and deletes everything provision
 * created, in reverse order, on every exit path: `body` returning or
 * throwing, a partial create, and SIGINT or SIGTERM (status `cancelled`).
 * While it runs, SIGINT and SIGTERM never kill the process; they abort
 * `ctx.signal`, and teardown starts at once without waiting for `body`.
 *
 * The one exception is the hand-off: once `body` calls `ctx.handOff()`, the
 * run belongs to its agent, and `withRun` keeps every resource on any exit;
 * `collect` or `sweep` deletes them later. Before the hand-off, any error or
 * signal tears down as above.
 *
 * It never throws for a failure of the run; the outcome says what happened.
 *
 * @param deps - provision, teardown and the signal source (injected)
 */
export function createWithRun(deps: WithRunDeps) {
  const signals: SignalSource = deps.signals ?? process;

  const fn = async <T>({
    plan,
    body,
    options
  }: z.output<typeof withRunInputSchema>): Promise<RunOutcome<T>> => {
    const run = body as (ctx: RunContext) => Promise<T>;
    const controller = new AbortController();
    let cancelledBy: NodeJS.Signals | null = null;
    let handedOff = false;
    let onCancel: () => void = () => {};
    const cancelled = new Promise<"cancelled">((resolve) => {
      onCancel = () => resolve("cancelled");
    });
    const listeners = SIGNALS.map((name) => {
      const listener = () => {
        if (cancelledBy !== null) return;
        cancelledBy = name;
        controller.abort();
        onCancel();
      };
      signals.on(name, listener);
      return [name, listener] as const;
    });

    try {
      let resources: RunResources = { runId: plan.runId, droplets: [] };
      let result:
        | { status: "completed"; value: T }
        | { status: "failed"; error: unknown }
        | { status: "cancelled" };
      try {
        const provisioned = await deps.provision(plan, {
          authorizedKeys: options.authorizedKeys,
          signal: controller.signal
        });
        resources = provisioned;
        const ctx: RunContext = {
          plan,
          run: provisioned,
          signal: controller.signal,
          handOff: () => {
            if (cancelledBy === null) handedOff = true;
          }
        };
        const pending = Promise.resolve().then(() => run(ctx));
        pending.catch(() => {});
        const raced = await Promise.race([
          pending.then((value) => ({ value })),
          cancelled
        ]);
        result =
          raced === "cancelled"
            ? { status: "cancelled" }
            : { status: "completed", value: raced.value };
      } catch (error) {
        if (error instanceof ProvisionError) resources = error.created;
        result =
          cancelledBy !== null
            ? { status: "cancelled" }
            : { status: "failed", error };
      }

      const teardown = handedOff ? NOTHING : await deps.teardown(resources);
      if (result.status === "cancelled" || cancelledBy !== null) {
        return {
          status: "cancelled",
          signal: cancelledBy ?? "SIGINT",
          teardown
        };
      }
      return { ...result, handedOff, teardown };
    } finally {
      listeners.forEach(([name, listener]) => signals.off(name, listener));
    }
  };

  const validated = withErrorHandlingAndValidation(fn, withRunInputSchema);
  return <T>(
    plan: Plan,
    body: (ctx: RunContext) => Promise<T>,
    options: WithRunOptions = {}
  ) => validated({ plan, body, options }) as Promise<RunOutcome<T>>;
}
