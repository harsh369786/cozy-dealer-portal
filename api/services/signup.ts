import { id, normalizePhone, nowIso } from "../utils";
import { notifySignupReviewers, withNotificationI18n } from "./notification-events";
import { findActiveUserByPhone, findDeletedUserIdByPhone } from "./user-phone";
import { resolveSubmittedLocation } from "./pincodes";

export type SignupApplicationInput = {
  name: string;
  birthday: string;
  storeName?: string | null;
  phone: string;
  address: string;
  gstNumber?: string | null;
  distributorName?: string | null;
  pincode?: string | null;
  area?: string | null;
};

export async function createSignupApplication(db: D1Database, input: SignupApplicationInput) {
  const phone = normalizePhone(input.phone);
  const contactName = input.name.trim();
  const storeName = input.storeName?.trim() || contactName;
  const gstNumber = input.gstNumber?.trim() || null;
  const distributorName = input.distributorName?.trim() || "";

  // Resolve + validate the pincode server-side against the master (rejects forged/invalid input).
  const loc = await resolveSubmittedLocation(db, { pincode: input.pincode, area: input.area });

  const existing = await findActiveUserByPhone(db, phone);

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

  const reuseUserId = await findDeletedUserIdByPhone(db, phone);
  const userId = reuseUserId ?? id("user");
  const appId = id("signup");
  const ts = nowIso();

  if (reuseUserId) {
    await db.batch([
      db
        .prepare(
          `UPDATE users SET phone = ?, name = ?, role = 'dealer', status = 'pending_approval',
           deleted_at = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(phone, contactName, ts, reuseUserId),
      db
        .prepare(
          `INSERT INTO signup_applications (
             id, user_id, name, birthday, store_name, phone, address, gst_number, distributor_name,
             pincode, state, district, area, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(
          appId,
          reuseUserId,
          contactName,
          input.birthday,
          storeName,
          phone,
          input.address.trim(),
          gstNumber,
          distributorName,
          loc.pincode,
          loc.state,
          loc.district,
          loc.area,
          ts,
          ts,
        ),
    ]);
  } else {
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, phone, name, role, status, created_at, updated_at)
           VALUES (?, ?, ?, 'dealer', 'pending_approval', ?, ?)`,
        )
        .bind(userId, phone, contactName, ts, ts),
      db
        .prepare(
          `INSERT INTO signup_applications (
             id, user_id, name, birthday, store_name, phone, address, gst_number, distributor_name,
             pincode, state, district, area, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(
          appId,
          userId,
          contactName,
          input.birthday,
          storeName,
          phone,
          input.address.trim(),
          gstNumber,
          distributorName,
          loc.pincode,
          loc.state,
          loc.district,
          loc.area,
          ts,
          ts,
        ),
    ]);
  }

  await notifySignupReviewers(db, {
    category: "system",
    type: "system",
    title: "New signup request",
    body: `${storeName} (${contactName}) is awaiting approval`,
    link: "/admin/users?tab=signup",
    ...withNotificationI18n("notifications.newSignupRequest.title", "notifications.newSignupRequest.body", {
      storeName,
      contactName,
    }),
  });

  return { id: appId, userId };
}
