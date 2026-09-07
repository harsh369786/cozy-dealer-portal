const CACHE = "backrest-static-v36";
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
      tag: notificationId || url,
      renotify: Boolean(notificationId),
      ...extra,
    }),
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
      tag: notificationId || url || "backrest",
      renotify: Boolean(notificationId),
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
