import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { requestUnreadCountRefresh } from "@/lib/notification-count-cache";
import {
  getServerPushStatus,
  isViewingNotificationTarget,
  markBrowserNotificationShown,
  requestPushPromptForSessionIfNeeded,
  resyncPushSubscription,
  showLocalNotification,
} from "@/lib/browser-notifications";
import {
  getNotificationsSince,
  markNotificationRead,
  type NotificationRow,
} from "@/services/notifications";
import { emitInAppNotification } from "@/lib/in-app-notifications";

const POLL_MS = 45_000;
const LAST_POLL_KEY = "backrest_notifications_last_poll";
const INITIALIZED_KEY = "backrest_notifications_poll_initialized";
// Only suppress the browser (polling) fallback when the SERVER confirms push is actually
// delivering: a subscription row exists, the last delivery was 2xx, and it happened recently.
// If push is broken/stale/unknown, the fallback must keep firing so the user still gets alerts.
const PUSH_HEALTHY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

async function isPushDeliveringViaServer(): Promise<boolean> {
  const status = await getServerPushStatus();
  if (!status || !status.subscribed || !status.lastDeliveryOk || !status.lastAttemptAt) {
    return false;
  }
  const last = new Date(status.lastAttemptAt).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= PUSH_HEALTHY_WINDOW_MS;
}

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

  for (const n of unread) {
    // Admin "in-app pop-up" announcements: when the notification is flagged popupEnabled, raise the
    // in-app modal (InAppNotificationOverlay). This is INDEPENDENT of the OS/push notification and
    // of the push-healthy skip — the popup is meant to show inside the open app. The overlay itself
    // enforces the per-day / per-event impression caps carried in metadata.
    if (n.metadata && (n.metadata as Record<string, unknown>)["popupEnabled"] === true) {
      emitInAppNotification({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        metadata: n.metadata,
      });
    }

    // OS/system notification fallback (only when server push isn't already delivering) so the user
    // gets a native alert while the app is open. Suppressed for the page they're already viewing.
    if (!skipBrowser && !isViewingNotificationTarget(n.link)) {
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

    // Defer non-critical background work off the first paint so it doesn't compete with the
    // page's own data fetch (home fires several API calls on mount). runIdle runs the callback
    // when the browser is idle, with a short setTimeout fallback for environments without
    // requestIdleCallback (Safari/iOS). All deferred work is cancellation-safe.
    const runIdle = (fn: () => void): (() => void) => {
      const w = window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
      if (typeof w.requestIdleCallback === "function") {
        const handle = w.requestIdleCallback(fn, { timeout: 2000 });
        return () => w.cancelIdleCallback?.(handle);
      }
      const t = window.setTimeout(fn, 800);
      return () => window.clearTimeout(t);
    };

    const poll = async () => {
      try {
        const since = getLastPollIso();
        // Skip the browser fallback ONLY if the server confirms push is currently delivering.
        // A merely-present browser subscription is NOT enough (it can be broken server-side).
        const pushHealthy = await isPushDeliveringViaServer();

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
          await processNewNotifications(items, pushHealthy);
        }
      } catch {
        // ignore polling errors
      }
    };

    // Deferred initial burst: the first notifications poll + re-registering any existing browser
    // push subscription with the server. Neither is needed for first paint, so run them when idle.
    const cancelIdle = runIdle(() => {
      if (cancelled) return;
      // Silent no-op when there's no local subscription; keeps a device that already granted push
      // from being left with a missing/stale server row after a deploy / cookie clear.
      void resyncPushSubscription();
      void poll();
    });

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
      cancelIdle();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [loading, user]);
}
