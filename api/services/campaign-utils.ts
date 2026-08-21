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

export function todayIso(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Stored status + date window → status shown to dealers/distributors. */
export function getEffectiveCampaignStatus(
  storedStatus: string,
  startDate: string,
  endDate: string,
  at = new Date(),
): CampaignStatus {
  const today = todayIso(at);
  const start = readCampaignDate(startDate);
  const end = readCampaignDate(endDate);
  if (!start || !end) return "expired";

  if (end < today) return "expired";
  if (storedStatus === "expired") return "expired";
  if (start > today || storedStatus === "upcoming") return "upcoming";
  if (storedStatus === "active") return "active";
  return storedStatus === "upcoming" || storedStatus === "expired"
    ? (storedStatus as CampaignStatus)
    : "active";
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
