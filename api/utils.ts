export function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
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
export const SESSION_DAYS = 30;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const MOCK_OTP_CODE = "123456";
