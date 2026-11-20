import { expect, test } from "@playwright/test";

test("le manifest est servi et valide", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/");
  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  const purposes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
  expect(purposes).toEqual(
    expect.arrayContaining(["192x192/any", "512x512/any", "192x192/maskable", "512x512/maskable"]),
  );
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("/sw.js est servi avec les bons en-têtes", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-cache");
  expect(res.headers()["service-worker-allowed"]).toBe("/");
});

test("le service worker s'enregistre et la page recharge hors ligne", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.some((k) => k.startsWith("elevage-shell-"))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Élevage de dragodindes" })).toBeVisible();
  await expect(page.getByText("Migration en cours")).toBeVisible();
  // Les styles (assets hashés) sont bien servis depuis le cache.
  await expect(page.locator("main")).toHaveCSS("display", "flex");
  await context.setOffline(false);
});

/* Chromium headless n'affiche pas de vraies notifications (permission toujours refusée) : on remplace
   showNotification dans le service worker et on lui envoie un événement push. */
test("le service worker transforme un push en notification (#16)", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "évaluation dans le service worker : Chromium seulement");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const affiche = await sw.evaluate(async () => {
    type Sw = { registration: { showNotification: (t: string, o: unknown) => Promise<void> }; PushEvent: new (t: string, i: unknown) => Event };
    const g = self as unknown as Sw;
    const vues: { titre: string; options: Record<string, unknown> }[] = [];
    g.registration.showNotification = async (titre, options) => void vues.push({ titre, options: options as Record<string, unknown> });
    const pousser = (data: unknown) => {
      try {
        self.dispatchEvent(new g.PushEvent("push", { data: JSON.stringify(data) }));
      } catch {
        /* waitUntil refuse un événement synthétique : sans effet sur l'affichage */
      }
    };
    pousser({ titre: "Enclos 2 : reviens à l’enclos", corps: "Reviens avant 21 h 40.", url: "/enclos#enclos-2", tag: "enclos-2" });
    pousser({ titre: "Piège", url: "https://evil.example.com/" });
    await new Promise((r) => setTimeout(r, 100));
    return vues;
  });
  expect(affiche).toHaveLength(2);
  expect(affiche[0]).toMatchObject({
    titre: "Enclos 2 : reviens à l’enclos",
    options: { body: "Reviens avant 21 h 40.", tag: "enclos-2", renotify: true, data: { url: "/enclos#enclos-2" } },
  });
  /* une URL externe est ramenée à /enclos */
  expect(affiche[1].options.data).toEqual({ url: "/enclos" });
});
