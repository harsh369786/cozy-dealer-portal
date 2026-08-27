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
        if (!cancelled) setUnread(0);
      }
    };

    void load();

    const onRefresh = () => void load(true);
    window.addEventListener(NOTIFICATION_COUNT_REFRESH_EVENT, onRefresh);

    const intervalId = window.setInterval(() => void load(true), refreshIntervalMs);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATION_COUNT_REFRESH_EVENT, onRefresh);
      window.clearInterval(intervalId);
    };
  }, [refreshIntervalMs]);

  return unread;
}
