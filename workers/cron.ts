import { getDatabase } from "../api/db/get-db";
import { scanPendingOrderReminders } from "../api/services/whatsapp";
import { dispatchScheduledAnnouncements } from "../api/services/system-notifications-admin";
import { effectiveEnv } from "../api/app";
import { setPushEnv, resolveExecutionContext } from "../api/push-env";
import type { ApiEnv } from "../api/types";

export async function purgeExpiredOtpChallenges(db: D1Database) {
  await db
    .prepare(`DELETE FROM otp_challenges WHERE expires_at < datetime('now') AND verified_at IS NULL`)
    .run();
}

export async function purgeExpiredSessions(db: D1Database) {
  await db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
}

export async function handleCron(env: ApiEnv, ctx?: ExecutionContext) {
  if (env.ENVIRONMENT === "production" && !env.CRON_SECRET) {
    console.warn("[cron] CRON_SECRET is not configured — internal cron endpoints are disabled");
  }

  // The request path sets these on every fetch; the cron path must set them too so that push
  // sends triggered by createNotificationsBatch (e.g. dispatched scheduled announcements) can
  // resolve VAPID keys (which may live on globalThis.__env__) and keep the background send alive.
  const merged = effectiveEnv(env);
  setPushEnv(merged);
  resolveExecutionContext(ctx);

  const db = await getDatabase(merged);
  await purgeExpiredOtpChallenges(db);
  await purgeExpiredSessions(db);
  await scanPendingOrderReminders(db);
  await dispatchScheduledAnnouncements(db);
}
