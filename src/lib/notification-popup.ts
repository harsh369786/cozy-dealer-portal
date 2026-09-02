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
