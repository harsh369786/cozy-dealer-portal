import { getDatabase } from "../api/db/get-db";
import { scanPendingOrderReminders } from "../api/services/whatsapp";
import type { ApiEnv } from "../api/types";

export async function purgeExpiredOtpChallenges(db: D1Database) {
  await db
    .prepare(`DELETE FROM otp_challenges WHERE expires_at < datetime('now') AND verified_at IS NULL`)
    .run();
}

export async function purgeExpiredSessions(db: D1Database) {
  await db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
}

export async function handleCron(env: ApiEnv) {
  if (env.ENVIRONMENT === "production" && !env.CRON_SECRET) {
    console.warn("[cron] CRON_SECRET is not configured — internal cron endpoints are disabled");
  }

  const db = await getDatabase(env);
  await purgeExpiredOtpChallenges(db);
  await purgeExpiredSessions(db);
  await scanPendingOrderReminders(db);
}
