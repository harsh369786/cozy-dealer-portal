import type { ApiEnv } from "./types";

let currentPushEnv: ApiEnv | undefined;
let executionCtx: ExecutionContext | undefined;

/** Vite/TanStack Start call fetch(request) with no Workers ExecutionContext. */
const nodeExecutionContext = {
  waitUntil(promise: Promise<unknown>) {
    void promise;
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
    void promise;
  }
}
