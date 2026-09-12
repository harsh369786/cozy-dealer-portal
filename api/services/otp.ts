import type { D1Database } from "@cloudflare/workers-types";
import type { ApiEnv } from "../types";

/**
 * Deliver the login OTP. The SAME code stored/validated by the app is sent — never a second OTP.
 * Delivery goes through the existing WhatsApp outbox (Gupshup `otp_for_login` template) so it shares
 * the one Gupshup client, is durable, and retries via the queue. If Gupshup isn't configured the
 * outbox row simply stays pending (nothing is sent). The OTP is ALWAYS a random 6-digit code.
 *
 * The OTP value is NEVER written to logs. No referenceId is set (OTP has no stable entity + is capped
 * by the OTP phone rate limiter), so it's excluded from the dedup index.
 */
async function deliverOtp(db: D1Database, env: ApiEnv | undefined, phone: string, code: string) {
  const { enqueueWhatsapp, processWhatsappOutbox } = await import("./whatsapp");
  const outboxId = await enqueueWhatsapp(db, env ?? {}, {
    toPhone: phone,
    templateKey: "otp_for_login",
    // New "login" template uses only {{1}} = the code.
    payload: { otp: code },
  });
  // OTP is time-critical and a single message — do NOT rely on the queue consumer / cron sweep to
  // deliver it (rows were observed stuck at 'pending'). Send it SYNCHRONOUSLY right now. Still
  // best-effort: processWhatsappOutbox never throws, so a WhatsApp failure never blocks login.
  if (outboxId && env) {
    await processWhatsappOutbox(db, env, outboxId);
  }
}

export async function generateOtpCode(phone?: string): Promise<string> {
  // Fixed demo OTP (123456) ONLY for the known demo login numbers (admin 9999999999, etc.) so the
  // team can still sign into those accounts without a real WhatsApp-reachable phone. EVERY other
  // (real) number gets a fresh cryptographically-random 6-digit OTP delivered over WhatsApp.
  const { isDemoLoginPhone } = await import("../../shared/demo-phones");
  if (isDemoLoginPhone(phone)) return "123456";
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(100000 + (random[0]! % 900000));
}

export async function requestOtp(db: D1Database, phone: string, env?: ApiEnv) {
  const { normalizePhone, sha256, id, nowIso, OTP_TTL_MINUTES } = await import("../utils");
  const normalized = normalizePhone(phone);
  const code = await generateOtpCode(normalized);
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const challengeId = id("otp");

  await db
    .prepare(`DELETE FROM otp_challenges WHERE phone = ? AND verified_at IS NULL`)
    .bind(normalized)
    .run();

  await db
    .prepare(`INSERT INTO otp_challenges (id, phone, code_hash, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(challengeId, normalized, await sha256(code), expires)
    .run();

  // Send the SAME code via WhatsApp (Gupshup otp_for_login). Best-effort: enqueueWhatsapp never
  // throws, so a WhatsApp failure never blocks login. The OTP value is not logged.
  await deliverOtp(db, env, normalized, code);
  return { challengeId, expiresAt: expires };
}

export async function verifyOtp(db: D1Database, phone: string, code: string) {
  const { normalizePhone, sha256, OTP_MAX_ATTEMPTS } = await import("../utils");
  const normalized = normalizePhone(phone);
  const codeHash = await sha256(code);

  const challenge = await db
    .prepare(
      `SELECT * FROM otp_challenges WHERE phone = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(normalized)
    .first<{
      id: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
    }>();

  if (!challenge) throw new Error("No OTP challenge found");
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new Error("Too many attempts");
  if (new Date(challenge.expires_at).getTime() < Date.now()) throw new Error("OTP expired");

  if (challenge.code_hash !== codeHash) {
    await db
      .prepare(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?`)
      .bind(challenge.id)
      .run();
    throw new Error("Invalid OTP");
  }

  await db
    .prepare(`UPDATE otp_challenges SET verified_at = datetime('now') WHERE id = ?`)
    .bind(challenge.id)
    .run();

  const user = await db
    .prepare(`SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL`)
    .bind(normalized)
    .first<Record<string, unknown>>();

  if (!user) throw new Error("Invalid OTP");
  if (user.status === "rejected") throw new Error("Your signup request was rejected");
  if (user.status === "suspended") throw new Error("Account suspended. Contact support.");
  if (user.status !== "active" && user.status !== "pending_approval") {
    throw new Error("Account is not eligible to sign in");
  }

  return user;
}
