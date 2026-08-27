const CACHE = "backrest-static-v11";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
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
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    ...options,
  });
}

self.addEventListener("push", (event) => {
  const data = parsePushData(event);
  const title = data.title || "BackRest";
  const body = data.body || "";
  const url = data.url || "/";
  const notificationId = data.notificationId || null;

  event.waitUntil(
    showAppNotification(title, {
      body,
      data: { url, notificationId },
      tag: notificationId || url,
      renotify: Boolean(notificationId),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const notificationId = event.notification.data?.notificationId || null;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.postMessage({ type: "NOTIFICATION_NAVIGATE", url, notificationId });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          const parsed = new URL(url, self.location.origin);
          const hash = notificationId ? `#ntf=${encodeURIComponent(notificationId)}` : "";
          const target = parsed.pathname + parsed.search + hash;
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
