import { getDatabase } from "../api/db/get-db";
import { scanPendingOrderReminders } from "../api/services/whatsapp";
import type { ApiEnv } from "../api/types";

export async function handleCron(env: ApiEnv) {
  const db = await getDatabase(env);
  await scanPendingOrderReminders(db);
}
