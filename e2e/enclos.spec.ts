import { expect, test, type Page } from "@playwright/test";

async function saisir(page: Page) {
  await page.getByRole("region", { name: "Enclos 1" }).getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
}

test("saisie d'un enclos : alerte ±5 000, heure de retour, persistance, agenda", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await saisir(page);

  await expect(carte.getByText(/Reviens avant 21 h 33/)).toBeVisible();
  await expect(carte.getByRole("alert")).toContainText("+5 000");
  await expect(carte.getByRole("alert")).toContainText("192 000 points");

  /* le plus urgent remonte en haut */
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Enclos 1");

  await page.reload();
  const carte2 = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte2.getByText(/Reviens avant 21 h 33/)).toBeVisible();
  await expect(carte2.getByRole("alert")).toContainText("+5 000");

  const download = page.waitForEvent("download");
  await carte2.getByRole("button", { name: "Ajouter à mon agenda" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/\.ics$/);
  const { readFile } = await import("node:fs/promises");
  const contenu = await readFile((await d.path())!, "utf8");
  expect(contenu).toContain("BEGIN:VEVENT");
  expect(contenu).toContain("BEGIN:VALARM");

  await expect(carte2.getByRole("link", { name: "Google Agenda" })).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(page).toHaveTitle(/·.*Enclos 1/);
});

test("un visage remplit la sérénité de la monture", async ({ page }) => {
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  await carte.getByRole("button", { name: /visage rouge/ }).click();
  await expect(carte.getByLabel("Sérénité exacte de la monture 1")).toHaveValue("-3500");
});

test("la page d'accueil mène aux enclos", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Mes enclos/ }).click();
  await expect(page.getByRole("heading", { name: "Mes enclos", level: 1 })).toBeVisible();
});

test("sans variables d'environnement : push désactivé avec explication, agenda toujours disponible", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const bouton = carte.getByRole("button", { name: "Recevoir une notification sur ce téléphone" });
  await expect(bouton).toBeVisible();
  await expect(bouton).toBeDisabled();
  await expect(carte.getByText(/pas encore configurées sur ce serveur/)).toBeVisible();
  await expect(carte.getByText(/Utilise plutôt « Ajouter à mon agenda »/)).toBeVisible();

  const download = page.waitForEvent("download");
  await carte.getByRole("button", { name: "Ajouter à mon agenda" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
});

test("API des rappels sans configuration : réponses propres, aucun crash", async ({ request }) => {
  const etat = await request.get("/api/reminders");
  expect(etat.status()).toBe(200);
  expect(await etat.json()).toMatchObject({ disponible: false });
  expect((await request.post("/api/reminders", { data: {} })).status()).toBe(503);
  expect((await request.post("/api/reminders/fire", { data: {} })).status()).toBe(503);
  expect((await request.delete("/api/reminders/msg_1", { data: { endpoint: "x" } })).status()).toBe(503);
});

test("un lien de notification ouvre l'enclos concerné", async ({ page }) => {
  await page.goto("/enclos#enclos-3");
  await expect(page.locator("#enclos-3")).toBeFocused();
  await expect(page.locator("#enclos-3")).toHaveAccessibleName("Enclos 3");
});
