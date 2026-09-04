import { toast } from "sonner";
import { api } from "@/lib/api-client";

const PROMPT_DISMISSED_KEY = "backrest_push_prompt_dismissed";
const FIRST_ORDER_KEY = "backrest_has_placed_order";
const SESSION_PROMPT_KEY = "backrest_push_session_prompted";
const SHOWN_IDS_KEY = "backrest_shown_notification_ids";

export const PUSH_PROMPT_EVENT = "backrest:push-prompt-request";

export type PushPromptReason = "first_order" | "session_start";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export function wasPushPromptDismissed() {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPushPrompt() {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export function shouldOfferPushPrompt() {
  return isPushSupported() && getNotificationPermission() === "default" && !wasPushPromptDismissed();
}

/** Fire when the prominent prompt should open (first order or non-dealer session). */
export function requestPushPrompt(reason: PushPromptReason) {
  if (typeof window === "undefined" || !shouldOfferPushPrompt()) return;
  window.dispatchEvent(new CustomEvent(PUSH_PROMPT_EVENT, { detail: { reason } }));
}

/** Call after a dealer successfully places an order — shows prompt on first order only. */
export function recordOrderPlaced() {
  if (typeof window === "undefined") return;
  try {
    const hadOrder = localStorage.getItem(FIRST_ORDER_KEY) === "1";
    localStorage.setItem(FIRST_ORDER_KEY, "1");
    if (!hadOrder) requestPushPrompt("first_order");
  } catch {
    requestPushPrompt("first_order");
  }
}

/** Non-dealers: one prompt per browser session after login. */
export function requestPushPromptForSessionIfNeeded(role: string | undefined) {
  if (typeof window === "undefined" || role === "dealer") return;
  if (!shouldOfferPushPrompt()) return;
  try {
    if (sessionStorage.getItem(SESSION_PROMPT_KEY) === "1") return;
    sessionStorage.setItem(SESSION_PROMPT_KEY, "1");
  } catch {
    // ignore
  }
  window.setTimeout(() => requestPushPrompt("session_start"), 2500);
}

function loadShownIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveShownIds(ids: Set<string>) {
  try {
    const trimmed = [...ids].slice(-200);
    sessionStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function hasShownBrowserNotification(id: string) {
  return loadShownIds().has(id);
}

export function markBrowserNotificationShown(id: string) {
  const ids = loadShownIds();
  ids.add(id);
  saveShownIds(ids);
}

function urlBasePath(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function isViewingNotificationTarget(link?: string | null) {
  if (!link || typeof window === "undefined") return false;
  const target = urlBasePath(link);
  const current = window.location.pathname;
  if (target === current) return true;
  if (target !== "/" && current.startsWith(target)) return true;
  return false;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await api.get<{ publicKey: string | null }>("/api/v1/notifications/vapid-public-key");
    return res.publicKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    toast.error("Push notifications aren't supported on this device or browser.");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    // User dismissed/blocked the prompt — not an error to shout about, but give a hint.
    if (permission === "denied") {
      toast.error("Notifications are blocked. Enable them in your browser settings to receive alerts.");
    }
    return false;
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    // Server has no VAPID public key configured (or the request failed) — this is the silent
    // failure the audit flagged; surface it so the user/admin knows push can't be enabled.
    toast.error("Couldn't enable push: notification server is not configured. Please try again later.");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys?.["auth"]) {
      toast.error("Couldn't enable push: the browser returned an invalid subscription.");
      return false;
    }

    await api.post("/api/v1/notifications/push-subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
    });

    dismissPushPrompt();
    return true;
  } catch (err) {
    // pushManager.subscribe (e.g. Brave/blocked push service) or the /push-subscribe POST failed.
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Couldn't enable push notifications: ${message}`);
    return false;
  }
}

/**
 * Silently re-register an EXISTING browser push subscription with the server (upsert). Used after
 * login so a device that already granted push doesn't end up with a missing/stale server row
 * (e.g. after a deploy dropped rows, cookie clear, or subscribing on another session). This never
 * prompts for permission and never subscribes anew — if there is no local subscription it is a
 * no-op. Failures are swallowed (best-effort background sync, no user-facing noise).
 */
export async function resyncPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (getNotificationPermission() !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys?.["auth"]) return;
    await api.post("/api/v1/notifications/push-subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
    });
  } catch {
    // best-effort; the toggle / server push-status still reflect the true state.
  }
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await api.delete("/api/v1/notifications/push-subscribe", { endpoint });
  } catch {
    // ignore
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export type PushServerStatus = {
  subscribed: boolean;
  lastDeliveryOk: boolean;
  lastAttemptAt: string | null;
  lastStatus: number | null;
  count: number;
};

/** Server-truth: does THIS user have a push subscription row on the server, and is it working? */
export async function getServerPushStatus(): Promise<PushServerStatus | null> {
  try {
    return await api.get<PushServerStatus>("/api/v1/notifications/push-status");
  } catch {
    return null;
  }
}

export async function showLocalNotification(input: {
  id: string;
  title: string;
  body: string;
  link?: string;
}) {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  if (hasShownBrowserNotification(input.id)) return;
  if (isViewingNotificationTarget(input.link)) return;

  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: "SHOW_NOTIFICATION",
    title: input.title,
    body: input.body,
    url: input.link ?? "/",
    notificationId: input.id,
  });
  markBrowserNotificationShown(input.id);
}
