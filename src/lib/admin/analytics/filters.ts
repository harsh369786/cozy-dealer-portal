import type { AnalyticsFilters } from "./types";

export const REPORT_MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;
export const DEFAULT_MONTH = "Aug";

const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  REPORT_MONTHS.map((m, i) => [m, i]),
);

export function normalizeFilters(raw: AnalyticsFilters): AnalyticsFilters {
  const month = raw.month && MONTH_INDEX[raw.month] !== undefined ? raw.month : DEFAULT_MONTH;
  return {
    month,
    fromMonth: raw.fromMonth ?? "Mar",
    toMonth: raw.toMonth ?? month,
    distributorId: raw.distributorId || undefined,
    salesExecutiveId: raw.salesExecutiveId || undefined,
    dealerId: raw.dealerId || undefined,
    product: raw.product || undefined,
    category: raw.category || undefined,
  };
}

export function monthInRange(month: string, from: string, to: string): boolean {
  const m = MONTH_INDEX[month] ?? -1;
  const f = MONTH_INDEX[from] ?? 0;
  const t = MONTH_INDEX[to] ?? REPORT_MONTHS.length - 1;
  return m >= f && m <= t;
}

export function previousMonth(month: string): string | undefined {
  const idx = MONTH_INDEX[month];
  if (idx === undefined || idx === 0) return undefined;
  return REPORT_MONTHS[idx - 1];
}

export function parseOrderMonth(placedAt: string): string | undefined {
  const match = placedAt.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
  return match?.[1];
}

export function parseComplaintMonth(createdAt: string): string | undefined {
  return parseOrderMonth(createdAt);
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function deltaDirection(changePct: number): "up" | "down" | "flat" {
  if (changePct > 0) return "up";
  if (changePct < 0) return "down";
  return "flat";
}

export function daysUntil(dateStr: string): number {
  const end = new Date(dateStr.replace(/(\d+) (\w+) (\d+)/, "$2 $1, $3"));
  const ref = new Date("Aug 19, 2026");
  return Math.max(0, Math.ceil((end.getTime() - ref.getTime()) / 86400000));
}
