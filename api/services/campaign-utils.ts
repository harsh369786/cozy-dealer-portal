export type CampaignStatus = "active" | "upcoming" | "expired";

/** Parse stored/read values; returns "" when missing (does not throw). */
export function readCampaignDate(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

/** Normalize to YYYY-MM-DD for storage and comparison (writes). */
export function normalizeCampaignDate(value: string): string {
  if (!value?.trim()) throw new Error("Date is required");
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

/** Today's calendar date in IST (Asia/Kolkata) as YYYY-MM-DD, so campaign windows follow the business day. */
export function todayIso(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Effective campaign status, computed PURELY from the date window in IST — the stored `status`
 * column is intentionally ignored so status is always automatic:
 *   Upcoming: today < start
 *   Active:   start <= today <= end
 *   Expired:  today > end
 * A campaign whose dates have passed can NEVER show as Upcoming/Active, and a future campaign can
 * only show as Upcoming, regardless of any stale stored status. The `_storedStatus` parameter is
 * kept for call-site compatibility but is unused.
 *
 * NOTE: comparison is day-granularity in IST (dates are stored as YYYY-MM-DD). A campaign is Active
 * for the whole end day and becomes Expired when the IST calendar rolls past it. End-of-day TIME
 * precision would require storing timestamps (schema change) — not done here.
 */
export function getEffectiveCampaignStatus(
  _storedStatus: string,
  startDate: string,
  endDate: string,
  at = new Date(),
): CampaignStatus {
  const today = todayIso(at);
  const start = readCampaignDate(startDate);
  const end = readCampaignDate(endDate);
  if (!start || !end) return "expired";

  if (today < start) return "upcoming";
  if (today > end) return "expired";
  return "active";
}

export function isCampaignLive(
  storedStatus: string,
  startDate: string,
  endDate: string,
  at = new Date(),
): boolean {
  return getEffectiveCampaignStatus(storedStatus, startDate, endDate, at) === "active";
}

export function matchesCampaignTab(
  effectiveStatus: CampaignStatus,
  tab: CampaignStatus | "all",
): boolean {
  if (tab === "all") return true;
  return effectiveStatus === tab;
}

export function campaignEndOfDayIso(endDate: string): string {
  const day = normalizeCampaignDate(endDate);
  return `${day}T23:59:59.999Z`;
}

export function campaignStartOfDayIso(startDate: string): string {
  const day = normalizeCampaignDate(startDate);
  return `${day}T00:00:00.000Z`;
}
