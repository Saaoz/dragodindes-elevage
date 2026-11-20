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
