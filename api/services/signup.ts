import { id, normalizePhone, nowIso } from "../utils";
import { notifySignupReviewers } from "./notification-events";

export type SignupApplicationInput = {
  name: string;
  birthday: string;
  storeName: string;
  phone: string;
  address: string;
  gstNumber?: string | null;
  distributorName: string;
};

export async function createSignupApplication(db: D1Database, input: SignupApplicationInput) {
  const phone = normalizePhone(input.phone);
  const existing = await db
    .prepare(`SELECT id, status FROM users WHERE phone = ? AND deleted_at IS NULL`)
    .bind(phone)
    .first<{ id: string; status: string }>();

  if (existing) {
    if (existing.status === "pending_approval") {
      throw new Error("Signup already pending approval for this phone number");
    }
    throw new Error("Phone number already registered");
  }

  const pendingApp = await db
    .prepare(`SELECT id FROM signup_applications WHERE phone = ? AND status = 'pending'`)
    .bind(phone)
    .first();
  if (pendingApp) throw new Error("A pending signup application already exists for this phone number");

  const recentAttempts = await db
    .prepare(
      `SELECT COUNT(*) as c FROM signup_applications
       WHERE phone = ? AND created_at > datetime('now', '-1 hour')`,
    )
    .bind(phone)
    .first<{ c: number }>();
  if ((recentAttempts?.c ?? 0) >= 3) {
    throw new Error("Too many signup attempts. Please try again later.");
  }

  const userId = id("user");
  const appId = id("signup");
  const ts = nowIso();

  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, phone, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'dealer', 'pending_approval', ?, ?)`,
      )
      .bind(userId, phone, input.name.trim(), ts, ts),
    db
      .prepare(
        `INSERT INTO signup_applications (
           id, user_id, name, birthday, store_name, phone, address, gst_number, distributor_name, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(
        appId,
        userId,
        input.name.trim(),
        input.birthday,
        input.storeName.trim(),
        phone,
        input.address.trim(),
        input.gstNumber ?? null,
        input.distributorName.trim(),
        ts,
        ts,
      ),
  ]);

  await notifySignupReviewers(db, {
    category: "system",
    type: "system",
    title: "New signup request",
    body: `${input.storeName.trim()} (${input.name.trim()}) is awaiting approval`,
    link: "/admin/users?tab=signup",
  });

  return { id: appId, userId };
}
