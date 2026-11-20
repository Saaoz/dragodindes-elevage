import { expect, test } from "@playwright/test";

test("la page d'accueil affiche le message de migration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Élevage de dragodindes" })).toBeVisible();
  await expect(page.getByText("Migration en cours")).toBeVisible();
  await expect(page.getByText("legacy/index.html")).toBeVisible();
});

test("la v2 est servie sous /legacy/", async ({ page }) => {
  const res = await page.goto("/legacy/index.html");
  expect(res?.status()).toBe(200);
});

test("le thème sombre peut être activé", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /thème/i }).click();
  const classes = await page.locator("html").getAttribute("class");
  expect(classes).toMatch(/dark|light/);
});
