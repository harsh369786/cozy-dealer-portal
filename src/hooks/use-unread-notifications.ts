import { useEffect, useState } from "react";
import {
  CACHE_TTL_MS,
  getCachedUnreadCount,
  getUnreadCountInflight,
  NOTIFICATION_COUNT_REFRESH_EVENT,
  setCachedUnreadCount,
  setUnreadCountInflight,
} from "@/lib/notification-count-cache";
import { getUnreadCount } from "@/services/notifications";

async function fetchUnreadCount(force = false): Promise<number> {
  const cached = getCachedUnreadCount();
  if (!force && cached != null) return cached;

  const existing = getUnreadCountInflight();
  if (existing) return existing;

  const promise = getUnreadCount()
    .then((count) => {
      setCachedUnreadCount(count);
      return count;
    })
    .finally(() => {
      setUnreadCountInflight(null);
    });

  setUnreadCountInflight(promise);
  return promise;
}

export function useUnreadNotificationCount(refreshIntervalMs = CACHE_TTL_MS) {
  const [unread, setUnread] = useState(() => getCachedUnreadCount() ?? 0);

  useEffect(() => {
    let cancelled = false;

    const load = async (force = false) => {
      try {
        const count = await fetchUnreadCount(force);
        if (!cancelled) setUnread(count);
      } catch {
        // M-4: a failed refresh (network blip / transient 401 during PWA cold launch) must NOT wipe
        // the badge to 0 — that flashes "no notifications" and then back. Keep the last known count;
        // the next successful poll/refresh corrects it.
      }
    };

    void load();

    const onRefresh = () => void load(true);
    window.addEventListener(NOTIFICATION_COUNT_REFRESH_EVENT, onRefresh);

    // Interval is a safety-net refresh that respects the TTL cache + in-flight dedupe
    // (force=false), so it won't stack redundant requests on top of the bridge poll or
    // the event-driven forced refreshes triggered by real notification actions.
    const intervalId = window.setInterval(() => void load(false), refreshIntervalMs);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATION_COUNT_REFRESH_EVENT, onRefresh);
      window.clearInterval(intervalId);
    };
  }, [refreshIntervalMs]);

  return unread;
}
