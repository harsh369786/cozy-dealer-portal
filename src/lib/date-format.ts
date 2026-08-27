export const IST_TIMEZONE = "Asia/Kolkata";

const FORMATTED_TIMESTAMP_RE = /^\d{2}\/\d{2}\/\d{4},\s*\d/;

function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveIntlLocale(locale?: string) {
  return locale === "hi" ? "hi-IN" : "en-IN";
}

function istParts(d: Date, locale?: string) {
  const parts = new Intl.DateTimeFormat(resolveIntlLocale(locale), {
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

/** Format YYYY-MM as "Mon YYYY" (e.g. Aug 2026) in IST. */
export function formatYearMonthLabel(ym: string, locale?: string): string {
  const match = ym.match(/^(\d{4})-(\d{2})/);
  if (!match) return ym;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(d.getTime())) return ym;
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    timeZone: IST_TIMEZONE,
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Display date as DD/MM/YYYY in IST. */
export function formatDisplayDate(iso: string, locale?: string): string {
  const d = parseIsoDate(iso);
  if (!d) {
    const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    return iso;
  }
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Display date + time as DD/MM/YYYY, h:mm AM/PM in IST. */
export function formatDisplayDateTime(iso: string, locale?: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Format ISO or pass through values already formatted for display. */
export function formatTimestamp(value: string, locale?: string): string {
  if (!value) return "";
  if (FORMATTED_TIMESTAMP_RE.test(value)) return value;
  return formatDisplayDateTime(value, locale);
}

/** Format native date input value (YYYY-MM-DD) for display. */
export function formatIsoDateInput(value: string, locale?: string): string {
  if (!value) return "";
  return formatDisplayDate(value, locale);
}

/** Locale-aware INR formatting (non-hook). */
export function formatInr(amount: number, locale?: string) {
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}