import type { ApiEnv } from "../types";

const DEV_DB_KEY = "__backrestDevDbPromise";

function isNodeRuntime() {
  return typeof process !== "undefined" && process.release?.name === "node";
}

function isCloudflareWorker() {
  return typeof caches !== "undefined";
}

function resolveBindings(env?: ApiEnv | null): ApiEnv | null | undefined {
  if (env?.DB) return env;
  return (globalThis as { __env__?: ApiEnv }).__env__ ?? env;
}

function getDevDatabaseSingleton(): Promise<D1Database> {
  const g = globalThis as Record<string, Promise<D1Database> | undefined>;
  if (!g[DEV_DB_KEY]) {
    g[DEV_DB_KEY] = import("./sqlite-d1").then((m) => m.createDevDatabase());
  }
  return g[DEV_DB_KEY];
}

/**
 * Cloudflare Workers: read D1 from Nitro's globalThis.__env__ or Hono c.env.
 * Vite dev (Node): always use local `.local.db` so OTP/session share one DB file.
 */
export async function getDatabase(env?: ApiEnv | null): Promise<D1Database> {
  const bindings = resolveBindings(env);

  if (isCloudflareWorker() && bindings?.DB) {
    return bindings.DB;
  }

  if (isNodeRuntime()) {
    return getDevDatabaseSingleton();
  }

  if (bindings?.DB) return bindings.DB;
  throw new Error("Database binding DB is not configured");
}
