export function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * M-5: a session token needs cryptographically strong, high-entropy randomness because it is a
 * bearer credential (its sha256 is stored as token_hash). The generic `id()` above uses only the
 * first 8 hex chars of a UUID (~32 bits) which is fine for DB row ids but far too little for a
 * guessable auth token. This yields 128 bits from crypto.getRandomValues as hex.
 */
export function sessionId(prefix = "sess"): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${prefix}-${hex}`;
}

/** Order id prefix for a calendar day in IST: `BR-DDMMYY` */
export function orderIdDatePrefix(reference = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(reference);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `BR-${get("day")}${get("month")}${get("year")}`;
}

/** Next order number for today (IST): `BR-DDMMYYNN` where NN is the daily sequence (01, 02, …). */
export async function nextOrderId(db: D1Database, reference = new Date()): Promise<string> {
  const prefix = orderIdDatePrefix(reference);
  const row = await db
    .prepare(
      `INSERT INTO order_sequences (date_prefix, last_value)
       VALUES (?, 1)
       ON CONFLICT(date_prefix) DO UPDATE SET last_value = last_value + 1
       RETURNING last_value`,
    )
    .bind(prefix)
    .first<{ last_value: number }>();
  if (!row) throw new Error("Could not allocate order number");
  const seq = row.last_value;
  return `${prefix}${String(seq).padStart(2, "0")}`;
}

/** Complaint number prefix for a calendar day in IST: `CP-DDMMYY` */
export function complaintNumberDatePrefix(reference = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(reference);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `CP-${get("day")}${get("month")}${get("year")}`;
}

/** Next human-facing complaint number for today (IST): `CP-DDMMYYNN` (NN is the daily sequence). */
export async function nextComplaintNumber(db: D1Database, reference = new Date()): Promise<string> {
  const prefix = complaintNumberDatePrefix(reference);
  const row = await db
    .prepare(
      `INSERT INTO complaint_sequences (date_prefix, last_value)
       VALUES (?, 1)
       ON CONFLICT(date_prefix) DO UPDATE SET last_value = last_value + 1
       RETURNING last_value`,
    )
    .bind(prefix)
    .first<{ last_value: number }>();
  if (!row) throw new Error("Could not allocate complaint number");
  return `${prefix}${String(row.last_value).padStart(2, "0")}`;
}

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return phone.trim();
}

export const IST_TIMEZONE = "Asia/Kolkata";

function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    dayPeriod: get("dayPeriod"),
  };
}

/** Display timestamp in IST as DD/MM/YYYY, h:mm AM/PM */
export function formatInLabel(iso: string) {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const { day, month, year, hour, minute, dayPeriod } = istParts(d);
  return `${day}/${month}/${year}, ${hour}:${minute} ${dayPeriod}`;
}

/** Display date-only in IST as DD/MM/YYYY */
export function formatInDate(iso: string) {
  const d = parseIsoDate(iso);
  if (!d) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
  }
  const { day, month, year } = istParts(d);
  return `${day}/${month}/${year}`;
}

export function istYearMonth(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

/** Today's calendar date in IST as YYYY-MM-DD (for campaign active/expiry windows). */
export function istTodayIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Format SQLite `YYYY-MM` (from strftime) as "Aug 2026". */
export function formatYearMonthLabel(ym: string | null | undefined): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(d.getTime())) return ym;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    month: "short",
    year: "numeric",
  }).format(d);
}

export function currentMonthLabels(reference = new Date()) {
  const curYm = istYearMonth(reference);
  const [cy, cm] = curYm.split("-").map(Number);
  const prevM = cm === 1 ? 12 : cm - 1;
  const prevY = cm === 1 ? cy - 1 : cy;
  const prevYm = `${prevY}-${String(prevM).padStart(2, "0")}`;
  return {
    currentMonthLabel: formatYearMonthLabel(curYm),
    previousMonthLabel: formatYearMonthLabel(prevYm),
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const SESSION_COOKIE = "backrest_session";
/**
 * Readable (non-HttpOnly) companion to SESSION_COOKIE. Value is always "1" (no secret). The client
 * reads it to distinguish "session cookie not attached yet" from "logged out". Must stay in sync
 * with the client constant of the same name in src/services/auth.ts.
 */
export const SESSION_PRESENT_COOKIE = "backrest_session_present";
export const SESSION_DAYS = 30;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const MOCK_OTP_CODE = "123456";

function isEnvFlagEnabled(value?: string | null) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** One-tap demo logins + mock OTP when enabled in Worker vars or local Vite. */
export function isDemoModeEnabled(env?: { MOCK_OTP?: string; DEMO_LOGINS_ENABLED?: string; ENVIRONMENT?: string } | null): boolean {
  // Explicit flags are authoritative (set via Worker vars or local Vite).
  if (isEnvFlagEnabled(env?.MOCK_OTP) || isEnvFlagEnabled(env?.DEMO_LOGINS_ENABLED)) return true;
  if (typeof process !== "undefined" && process.env) {
    if (isEnvFlagEnabled(process.env.MOCK_OTP) || isEnvFlagEnabled(process.env.DEMO_LOGINS_ENABLED)) return true;
  }
  // If the Worker env explicitly declares an environment, trust ONLY that (never the ambient
  // process, which nodejs_compat can make truthy in production). Otherwise fall back to a
  // Node (local/dev tooling) heuristic.
  const declaredEnvironment = env?.ENVIRONMENT;
  if (declaredEnvironment !== undefined) {
    return false;
  }
  const environment = typeof process !== "undefined" ? process.env?.ENVIRONMENT : undefined;
  return (
    typeof process !== "undefined" &&
    process.release?.name === "node" &&
    environment !== "production"
  );
}

// --- Lightweight numeric input guards -------------------------------------------------
// These reject garbage numbers (NaN, negative, non-integer, absurdly large) at write
// boundaries so bad values never reach the DB or pricing math. They throw plain Errors;
// route handlers already catch and surface these as 400s.

/** Max order quantity per line — a sane cap to reject fat-finger / abusive values. */
export const MAX_ORDER_QUANTITY = 10000;

/**
 * Assert a value is a positive integer within [1, max]. Returns the validated number.
 * Rejects NaN, Infinity, <= 0, non-integers, and anything above the cap.
 */
export function assertPositiveInt(value: unknown, label = "quantity", max = MAX_ORDER_QUANTITY): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid ${label}: must be a whole number of at least 1`);
  }
  if (n > max) {
    throw new Error(`Invalid ${label}: must be at most ${max}`);
  }
  return n;
}

/**
 * Assert a value is a finite, non-negative money/points amount within [0, max]. Returns it.
 * Allows fractional currency; rejects NaN, Infinity, negatives, and absurd magnitudes.
 */
export function assertNonNegativeAmount(value: unknown, label = "amount", max = 1_000_000_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${label}: must be a non-negative number`);
  }
  if (n > max) {
    throw new Error(`Invalid ${label}: value is too large`);
  }
  return n;
}

/**
 * Assert a percentage is finite and within [0, max] (default 0–100). Returns it.
 */
export function assertPercent(value: unknown, label = "percent", max = 100): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    throw new Error(`Invalid ${label}: must be between 0 and ${max}`);
  }
  return n;
}
