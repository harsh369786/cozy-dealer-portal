import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { requestUnreadCountRefresh } from "@/lib/notification-count-cache";
import {
  hasActivePushSubscription,
  isViewingNotificationTarget,
  markBrowserNotificationShown,
  requestPushPromptForSessionIfNeeded,
  showLocalNotification,
} from "@/lib/browser-notifications";
import {
  getNotificationsSince,
  markNotificationRead,
  type NotificationRow,
} from "@/services/notifications";

const POLL_MS = 45_000;
const LAST_POLL_KEY = "backrest_notifications_last_poll";
const INITIALIZED_KEY = "backrest_notifications_poll_initialized";

function getLastPollIso(): string | undefined {
  try {
    return sessionStorage.getItem(LAST_POLL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function setLastPollIso(iso: string) {
  try {
    sessionStorage.setItem(LAST_POLL_KEY, iso);
  } catch {
    // ignore
  }
}

function isPollInitialized(): boolean {
  try {
    return sessionStorage.getItem(INITIALIZED_KEY) === "1";
  } catch {
    return false;
  }
}

function setPollInitialized() {
  try {
    sessionStorage.setItem(INITIALIZED_KEY, "1");
  } catch {
    // ignore
  }
}

function handleNotificationNavigateHash() {
  const match = window.location.hash.match(/^#ntf=([^&]+)/);
  if (!match?.[1]) return;
  const notificationId = decodeURIComponent(match[1]);
  void markNotificationRead(notificationId).finally(() => {
    requestUnreadCountRefresh();
  });
  markBrowserNotificationShown(notificationId);
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", clean);
}

async function processNewNotifications(items: NotificationRow[], skipBrowser: boolean) {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;

  if (!skipBrowser) {
    for (const n of unread) {
      if (isViewingNotificationTarget(n.link)) continue;
      await showLocalNotification({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
      });
    }
  }

  requestUnreadCountRefresh();
}

export function useNotificationBridge() {
  const { user, loading } = useSession();

  useEffect(() => {
    if (loading || !user || user.status !== "active") return;

    handleNotificationNavigateHash();
    requestPushPromptForSessionIfNeeded(user.role);

    let cancelled = false;

    const poll = async () => {
      try {
        const since = getLastPollIso();
        const pushSubscribed = await hasActivePushSubscription();

        if (!isPollInitialized()) {
          const baseline = await getNotificationsSince();
          if (!cancelled) {
            if (baseline[0]) setLastPollIso(baseline[0].createdAt);
            else setLastPollIso(new Date().toISOString());
            setPollInitialized();
          }
          return;
        }

        const items = await getNotificationsSince(since);
        if (cancelled) return;
        if (items.length) {
          const newest = items.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
          setLastPollIso(newest.createdAt);
          await processNewNotifications(items, pushSubscribed);
        }
      } catch {
        // ignore polling errors
      }
    };

    void poll();
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void poll(), POLL_MS);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        url?: string;
        notificationId?: string;
      };
      if (data?.type !== "NOTIFICATION_NAVIGATE") return;
      const url = data.url ?? "/";
      if (data.notificationId) {
        void markNotificationRead(data.notificationId).finally(() => {
          requestUnreadCountRefresh();
        });
        markBrowserNotificationShown(data.notificationId);
      }
      if (url.startsWith("/")) {
        window.location.assign(url);
      }
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [loading, user]);
}
