import type { ApiEnv } from "./types";

let currentPushEnv: ApiEnv | undefined;
let executionCtx: ExecutionContext | undefined;

/**
 * Vite/TanStack Start call fetch(request) with no Workers ExecutionContext.
 * In that case there is no platform to keep the request alive, so we must NOT drop the
 * promise (that silently loses local push sends). We attach a catch so a rejection can't
 * become an unhandled-rejection, but we still let the work run to completion in-process.
 */
const nodeExecutionContext = {
  waitUntil(promise: Promise<unknown>) {
    Promise.resolve(promise).catch((err) => {
      console.error("[push] background task failed (local/no-ctx):", err);
    });
  },
  passThroughOnException() {},
  props: {},
} as ExecutionContext;

export function setPushEnv(env: ApiEnv) {
  currentPushEnv = env;
}

export function getPushEnv(): ApiEnv | undefined {
  return currentPushEnv;
}

/**
 * A per-call snapshot of the push env + the execution context that were current at capture
 * time. Because the module-level singletons are overwritten on every request, callers that
 * schedule background work must grab BOTH together (snapshotPushContext) and pass the pair
 * to runBackground — otherwise a concurrent request could swap the context out from under an
 * in-flight send and truncate it.
 */
export type PushContext = { env: ApiEnv | undefined; ctx: ExecutionContext };

export function snapshotPushContext(): PushContext {
  return { env: currentPushEnv, ctx: executionCtx ?? nodeExecutionContext };
}

/** Extend a background task using a CAPTURED context (not the possibly-newer global). */
export function runBackground(ctx: ExecutionContext, promise: Promise<unknown>) {
  ctx.waitUntil(
    Promise.resolve(promise).catch((err) => {
      console.error("[push] background task failed:", err);
    }),
  );
}

function isExecutionContext(ctx: unknown): ctx is ExecutionContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "waitUntil" in ctx &&
    typeof (ctx as { waitUntil: unknown }).waitUntil === "function"
  );
}

/** Always return a context Hono can store, so `c.executionCtx` never throws in local dev. */
export function resolveExecutionContext(ctx: unknown): ExecutionContext {
  const resolved = isExecutionContext(ctx) ? ctx : nodeExecutionContext;
  executionCtx = resolved;
  return resolved;
}

export function waitUntil(promise: Promise<unknown>) {
  if (executionCtx) {
    executionCtx.waitUntil(promise);
  } else {
    // No execution context (local dev / no Workers runtime): still run the task to
    // completion in-process instead of dropping it, so local push sends actually fire.
    Promise.resolve(promise).catch((err) => {
      console.error("[push] background task failed (no ctx):", err);
    });
  }
}
