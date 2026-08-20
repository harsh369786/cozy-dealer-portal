import type { D1Database } from "@cloudflare/workers-types";

export type OtpProvider = {
  sendOtp(phone: string, code: string): Promise<void>;
};

export class MockOtpProvider implements OtpProvider {
  async sendOtp(phone: string, code: string) {
    if (typeof process !== "undefined") {
      console.info(`[otp:mock] ${phone} → ${code}`);
    }
  }
}

export function getOtpProvider(): OtpProvider {
  return new MockOtpProvider();
}

export function generateOtpCode(): string {
  if (typeof process !== "undefined" && process.env?.ENVIRONMENT !== "production") {
    return "123456";
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function requestOtp(db: D1Database, phone: string) {
  const { normalizePhone, sha256, id, nowIso, OTP_TTL_MINUTES } = await import("../utils");
  const normalized = normalizePhone(phone);
  const code = generateOtpCode();
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

  const provider = getOtpProvider();
  await provider.sendOtp(normalized, code);
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
    .prepare(`SELECT * FROM users WHERE phone = ? AND status = 'active' AND deleted_at IS NULL`)
    .bind(normalized)
    .first<Record<string, unknown>>();

  if (!user) throw new Error("Phone not registered. Apply via signup.");
  return user;
}
