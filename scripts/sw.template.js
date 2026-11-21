/* Service worker écrit à la main : app shell hors ligne.
   SOURCE : ce fichier est un modèle. `scripts/build-sw.mjs` (hook `prebuild`) remplace le marqueur de version
   ci-dessous et génère public/sw.js (non versionné) : la version change donc à chaque build (#55).
   Un seul cache par version ; tout cache `elevage-*` d'une autre version est supprimé à l'activation. */
const VERSION = "__SW_VERSION__";
const CURRENT = `elevage-${VERSION}`;
// Pages de l'appli : leur HTML est mis en cache, et les assets hashés qu'elles référencent aussi.
const PAGES = ["/", "/enclos", "/rentabilite", "/guide"];
const SHELL_URLS = [
  ...PAGES,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CURRENT);
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (!res.ok) return;
            await shell.put(url, res.clone());
            // Pré-cache les assets hashés référencés par chaque page.
            if (PAGES.includes(url)) {
              const html = await res.text();
              const assets = new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) || []);
              const store = shell;
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
          .filter((n) => n.startsWith("elevage-") && n !== CURRENT)
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
        const cache = await caches.open(CURRENT);
        try {
          const res = await fetch(req);
          if (res.ok) event.waitUntil(cache.put(req, res.clone()));
          return res;
        } catch {
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("/")) ||
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
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|png|jpg|svg|ico)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CURRENT);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) event.waitUntil(cache.put(req, res.clone()));
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});
