import type { D1Database } from "@cloudflare/workers-types";
import { isDemoLoginPhone } from "../../shared/demo-phones";
import { normalizePhone } from "../utils";

export async function resolveDemoLoginUser(db: D1Database, phone: string) {
  const normalized = normalizePhone(phone);
  if (!isDemoLoginPhone(normalized)) {
    throw new Error("DEMO_LOGIN_NOT_ALLOWED");
  }

  const user = await db
    .prepare(`SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL`)
    .bind(normalized)
    .first<Record<string, unknown>>();

  if (!user) throw new Error("PHONE_NOT_REGISTERED");
  if (user["status"] === "rejected") throw new Error("Your signup request was rejected");
  if (user["status"] === "suspended") throw new Error("Account suspended. Contact support.");
  if (user["status"] !== "active" && user["status"] !== "pending_approval") {
    throw new Error("Account is not eligible to sign in");
  }

  return user;
}
