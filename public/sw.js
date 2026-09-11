const CACHE = "backrest-static-v53";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/badge-monochrome.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// L-4: surface (instead of silently swallowing) any promise rejection or error that escapes a
// handler in the service worker. Without this, a rejected waitUntil()/fetch()/push handler just
// vanishes, making SW bugs (e.g. a failed cache write or a bad push payload) invisible in the
// field. We log for diagnostics and mark it handled so it doesn't spam the console as "Uncaught".
self.addEventListener("unhandledrejection", (event) => {
  console.error("[sw] unhandled promise rejection:", event.reason);
  event.preventDefault();
});

self.addEventListener("error", (event) => {
  console.error("[sw] uncaught error:", event.message, event.error);
});

function parsePushData(event) {
  try {
    if (event.data) {
      return event.data.json();
    }
  } catch {
    // ignore
  }
  return {};
}

function showAppNotification(title, options) {
  return self.registration.showNotification(title, {
    // Large icon: the full-color square BackRest app mark.
    icon: "/icons/icon-192.png",
    // Status-bar badge: MUST be a monochrome/transparent glyph — Android masks the badge to a
    // silhouette via its alpha channel, so a full-color icon renders as a solid blob. This is
    // a flat white spine glyph on transparent. PNG (not SVG): several Android/Chrome builds
    // ignore an SVG badge and fall back to a generic dot, so we ship a rasterised 96x96 PNG.
    badge: "/icons/badge-monochrome.png",
    // Defaults so notifications STACK (unique tag per call, set by callers), buzz, carry a
    // timestamp, and stay until the user acts on them. Callers can still override any of these.
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    requireInteraction: true,
    ...options,
  });
}

self.addEventListener("push", (event) => {
  const data = parsePushData(event);
  const title = data.title || "BackRest";
  const body = data.body || "";
  const url = data.url || "/";
  const notificationId = data.notificationId || null;

  const extra = {};
  // Honor a server-sent icon/badge if present; otherwise showAppNotification's defaults apply.
  if (data.icon) extra.icon = data.icon;
  if (data.badge) extra.badge = data.badge;

  event.waitUntil(
    showAppNotification(title, {
      body,
      data: { url, notificationId },
      // Unique tag per notification so they STACK instead of collapsing onto the same tag.
      tag: notificationId || "msg-" + Date.now(),
      renotify: Boolean(notificationId),
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction: true,
      ...extra,
    }),
  );
});

// VAPID key + POST helpers for auto-resubscribe (used by pushsubscriptionchange).
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function postSubscriptionToServer(subscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) return;
  await fetch("/api/v1/notifications/push-subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Include cookies so the server associates the subscription with the logged-in user.
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}

// Requirement #7: when the browser/OS ROTATES the push token (which happens periodically on
// Android/Chrome and after long idle), the old endpoint silently becomes invalid. Without handling
// this the device stops receiving push until the app is reopened. Here we transparently re-subscribe
// with the same VAPID key and register the NEW subscription with the server — no app open needed.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Reuse the applicationServerKey from the expiring subscription when the browser provides it
        // (event.oldSubscription); otherwise fetch the server's current VAPID public key.
        let applicationServerKey = event.oldSubscription?.options?.applicationServerKey ?? null;
        if (!applicationServerKey) {
          const res = await fetch("/api/v1/notifications/vapid-public-key", { credentials: "include" });
          const data = await res.json().catch(() => ({}));
          if (data && data.publicKey) {
            applicationServerKey = urlBase64ToUint8Array(data.publicKey);
          }
        }
        if (!applicationServerKey) return;

        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await postSubscriptionToServer(newSubscription);
      } catch (err) {
        console.error("[sw] pushsubscriptionchange resubscribe failed:", err);
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const notificationId = event.notification.data?.notificationId || null;

  const parsed = new URL(url, self.location.origin);
  const hash = notificationId ? `#ntf=${encodeURIComponent(notificationId)}` : "";
  const target = parsed.pathname + parsed.search + hash;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and let the in-app bridge do a single SPA
        // navigation via postMessage. We deliberately DO NOT also call client.navigate() —
        // doing both caused a double navigation / hard refresh on tap.
        for (const client of clientList) {
          if ("focus" in client) {
            client.postMessage({ type: "NOTIFICATION_NAVIGATE", url, notificationId });
            return client.focus();
          }
        }
        // No open window (app closed / logged out): open a fresh one at the deep link. The
        // target carries the #ntf= hash, and if the user is logged out the login flow persists
        // and replays it after auth (see storePendingNotificationTarget in the app).
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return;
  const { title, body, url, notificationId } = event.data;
  event.waitUntil(
    showAppNotification(title || "BackRest", {
      body: body || "",
      data: { url: url || "/", notificationId: notificationId || null },
      tag: notificationId || "msg-" + Date.now(),
      renotify: Boolean(notificationId),
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction: true,
    }),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    PRECACHE.includes(url.pathname) ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/");
          return shell ?? Response.error();
        }),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
