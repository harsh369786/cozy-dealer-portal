import type { ApiEnv } from "../types";

const DEV_DB_KEY = "__backrestDevDbPromise";

function isNodeRuntime() {
  return typeof process !== "undefined" && process.release?.name === "node";
}

function getDevDatabaseSingleton(): Promise<D1Database> {
  const g = globalThis as Record<string, Promise<D1Database> | undefined>;
  if (!g[DEV_DB_KEY]) {
    g[DEV_DB_KEY] = import("./sqlite-d1").then((m) => m.createDevDatabase());
  }
  return g[DEV_DB_KEY];
}

/**
 * In Vite dev (Node), Nitro may inject a Cloudflare D1 binding that does not
 * share state with our seeded `.local.db` file — OTP challenges written there
 * are invisible to verify on the next request. Always use local SQLite in Node.
 */
export async function getDatabase(env?: ApiEnv | null): Promise<D1Database> {
  if (isNodeRuntime()) {
    return getDevDatabaseSingleton();
  }
  if (env?.DB) return env.DB;
  return getDevDatabaseSingleton();
}
