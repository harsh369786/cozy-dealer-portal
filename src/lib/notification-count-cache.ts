const CACHE_TTL_MS = 60_000;

export const NOTIFICATION_COUNT_REFRESH_EVENT = "notifications:count-refresh";

let cachedCount: number | null = null;
let cachedAt = 0;
let inflight: Promise<number> | null = null;

export function getCachedUnreadCount(): number | null {
  if (cachedCount == null || Date.now() - cachedAt >= CACHE_TTL_MS) return null;
  return cachedCount;
}

export function setCachedUnreadCount(count: number) {
  cachedCount = count;
  cachedAt = Date.now();
}

export function invalidateUnreadCountCache() {
  cachedCount = null;
  cachedAt = 0;
}

export function requestUnreadCountRefresh() {
  invalidateUnreadCountCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_REFRESH_EVENT));
  }
}

export function getUnreadCountInflight() {
  return inflight;
}

export function setUnreadCountInflight(promise: Promise<number> | null) {
  inflight = promise;
}

export { CACHE_TTL_MS };
