/* Service worker écrit à la main : app shell hors ligne + notifications push (#16).
   Changer VERSION invalide les anciens caches. */
const VERSION = "v2";
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

// --- Push (#16) ---
// Payload JSON envoyé par /api/reminders/fire : { "titre", "corps", "url": "/enclos#enclos-N", "tag" }
// Sur iOS, CHAQUE push doit afficher une notification (sinon Safari finit par révoquer l'abonnement).
const cheminInterne = (u) => (typeof u === "string" && /^\/(?!\/)/.test(u) ? u : "/enclos");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { corps: event.data ? event.data.text() : "" };
  }
  const title = (typeof data.titre === "string" && data.titre) || "Élevage de dragodindes";
  const options = {
    body: typeof data.corps === "string" ? data.corps : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: cheminInterne(data.url) },
    timestamp: Date.now(),
  };
  if (typeof data.tag === "string" && data.tag) {
    options.tag = data.tag; // une notification plus récente du même enclos remplace l'ancienne
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(cheminInterne(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Une fenêtre de l'appli est déjà ouverte : on la réutilise (de préférence celle déjà sur /enclos).
      const memeOrigine = wins.filter((w) => new URL(w.url).origin === self.location.origin);
      const w = memeOrigine.find((x) => new URL(x.url).pathname === target.pathname) || memeOrigine[0];
      if (w) {
        try {
          const f = (await w.focus()) || w;
          if (new URL(f.url).href !== target.href) await f.navigate(target.href);
          return;
        } catch {
          /* fenêtre non contrôlée par ce service worker : on en ouvre une nouvelle */
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
