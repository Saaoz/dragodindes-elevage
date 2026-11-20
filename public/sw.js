/* Service worker écrit à la main : app shell hors ligne + squelette push (#16).
   Changer VERSION invalide les anciens caches. */
const VERSION = "v1";
const SHELL_CACHE = `elevage-shell-${VERSION}`;
const ASSET_CACHE = `elevage-assets-${VERSION}`;
const PAGE_CACHE = `elevage-pages-${VERSION}`;
const CURRENT = [SHELL_CACHE, ASSET_CACHE, PAGE_CACHE];
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/legacy/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (!res.ok) return;
            await shell.put(url, res.clone());
            // Pré-cache les assets hashés référencés par la page d'accueil.
            if (url === "/") {
              const html = await res.text();
              const assets = new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) || []);
              const store = await caches.open(ASSET_CACHE);
              await Promise.all(
                [...assets].map((a) =>
                  fetch(a)
                    .then((r) => (r.ok ? store.put(a, r) : undefined))
                    .catch(() => undefined),
                ),
              );
            }
          } catch {
            /* hors ligne pendant l'installation : on réessaiera à la prochaine version */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("elevage-") && !CURRENT.includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;

  // Navigation : réseau d'abord, repli sur le cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(PAGE_CACHE)).put(req, res.clone());
          return res;
        } catch {
          return (
            (await caches.match(req, { ignoreSearch: true })) ||
            (await caches.match("/")) ||
            new Response("Hors ligne", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Assets statiques : cache d'abord (les fichiers /_next/static sont immuables).
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/legacy/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|png|jpg|svg|ico)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(ASSET_CACHE)).put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});

// --- Push (squelette, complété par #16) ---
// Payload JSON attendu : { "titre": "...", "corps": "...", "url": "/..." }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { corps: event.data ? event.data.text() : "" };
  }
  const title = data.titre || "Élevage de dragodindes";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.corps || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
