const IMPRESSION_KEY = "backrest_popup_impressions";

function readCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(IMPRESSION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeCounts(counts: Record<string, number>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPRESSION_KEY, JSON.stringify(counts));
}

export function popupImpressionCount(notificationId: string): number {
  return Number(readCounts()[notificationId] ?? 0);
}

export function recordPopupImpression(notificationId: string): number {
  const counts = readCounts();
  const next = (Number(counts[notificationId] ?? 0) || 0) + 1;
  counts[notificationId] = next;
  writeCounts(counts);
  return next;
}

export function canShowAnnouncementPopup(
  notificationId: string,
  maxImpressions: number,
): boolean {
  const max = Math.max(0, Math.floor(Number(maxImpressions) || 0));
  if (max <= 0) return false;
  return popupImpressionCount(notificationId) < max;
}

// ---- Per-day pop-up frequency (spec: "how many times per day", default 1) --------------------
// Keyed by the SEND EVENT + the IST calendar day, so the cap is "N times per day per user" and
// resets each IST day. Using the send-event id (not the per-recipient notification id) means the
// same broadcast is capped consistently for a user across the day.

const PER_DAY_KEY = "backrest_popup_daily";

/** IST calendar day (YYYY-MM-DD) for "per day" bucketing. */
function istDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function readDaily(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PER_DAY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeDaily(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  // Prune stale days so the store doesn't grow unbounded — keep only today's keys.
  const today = istDay();
  const pruned: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k.endsWith(`|${today}`)) pruned[k] = v;
  }
  localStorage.setItem(PER_DAY_KEY, JSON.stringify(pruned));
}

function dailyKey(sendEventId: string): string {
  return `${sendEventId}|${istDay()}`;
}

/** How many times this send event's pop-up has shown to this user TODAY (IST). */
export function popupDailyCount(sendEventId: string): number {
  return Number(readDaily()[dailyKey(sendEventId)] ?? 0);
}

/** True if the send event's pop-up may still show today (count < perDay). */
export function canShowPopupToday(sendEventId: string, maxPerDay: number): boolean {
  const max = Math.max(0, Math.floor(Number(maxPerDay) || 0));
  if (max <= 0) return false;
  return popupDailyCount(sendEventId) < max;
}

/** Record one impression for this send event today (IST). */
export function recordPopupDaily(sendEventId: string): number {
  const map = readDaily();
  const key = dailyKey(sendEventId);
  const next = (Number(map[key] ?? 0) || 0) + 1;
  map[key] = next;
  writeDaily(map);
  return next;
}
