import { expect, test, type Page } from "@playwright/test";

async function saisir(page: Page) {
  await page.getByRole("region", { name: "Enclos 1" }).getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
}

const etatLocal = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));

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
  /* rappel 5 min avant le retour (21 h 33 min 20 s, heure locale) */
  expect(contenu).toContain(`DTSTART:${new Date(2026, 10, 20, 21, 28, 20).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`);

  await expect(carte2.getByRole("link", { name: "Google Agenda" })).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(page).toHaveTitle(/·.*Enclos 1/);
});

test("un visage (icône colorée) remplit la sérénité de la monture", async ({ page }) => {
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  const rouge = carte.getByRole("button", { name: /visage rouge/ });
  await expect(rouge.locator("svg")).toBeVisible();
  await rouge.click();
  await expect(rouge).toHaveAttribute("aria-pressed", "true");
  await expect(carte.getByLabel("Sérénité exacte de la monture 1")).toHaveValue("-3500");
  /* plus de visages en ASCII */
  await expect(carte.getByText(":C", { exact: true })).toHaveCount(0);
});

test("objectif et marge de rappel : enregistrés et visibles après rechargement", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte.getByText(/Rappel 5 min avant l.heure de retour, soit à 21 h 28/)).toBeVisible();

  await page.getByRole("group", { name: "Marge des rappels avant l'heure de retour" }).getByRole("button", { name: "15 min" }).click();
  await expect(carte.getByText(/Rappel 15 min avant l.heure de retour, soit à 21 h 18/)).toBeVisible();

  await carte.getByRole("button", { name: "Rester en Maturité" }).click();
  await expect(carte.getByRole("button", { name: "Rester en Maturité" })).toHaveAttribute("aria-pressed", "true");
  await expect(carte.getByText(/sort de la zone Maturité/)).toBeVisible();

  await page.reload();
  const carte2 = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte2.getByRole("button", { name: "Rester en Maturité" })).toHaveAttribute("aria-pressed", "true");
  await expect(carte2.getByText(/Rappel 15 min avant/)).toBeVisible();
});

test("le tableau de bord montre l'enclos le plus urgent", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  const lien = page.getByRole("link", { name: /Enclos 1.*Reviens avant 21 h 33/ });
  await expect(lien).toBeVisible();
  await lien.click();
  await expect(page).toHaveURL(/\/enclos#enclos-1$/);
});

test("la page d'accueil mène aux enclos", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Saisir un enclos/ }).first().click();
  await expect(page.getByRole("heading", { name: "Mes enclos", level: 1 })).toBeVisible();
});

test("mode démo sur les enclos : enclos fictifs, rien n'est écrit", async ({ page }) => {
  await page.goto("/enclos");
  await expect(page.getByRole("region", { name: "Enclos 1" })).toBeVisible();
  const avant = await etatLocal(page);
  await page.getByRole("button", { name: "Voir une démo" }).click();
  await expect(page.getByTestId("banniere-demo")).toBeVisible();
  const demo = page.getByRole("region", { name: "Enclos 1 (démo)" });
  await expect(demo.getByText(/Reviens avant/)).toBeVisible();
  await expect(demo.getByText("Pas de notification en mode démo.")).toBeVisible();
  await demo.getByRole("button", { name: "Rester en Maturité" }).click();
  await page.getByRole("button", { name: "30 min" }).click();
  expect(await etatLocal(page)).toBe(avant);
  await page.getByRole("button", { name: "Quitter la démo" }).first().click();
  await expect(page.getByTestId("banniere-demo")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Enclos 1 (démo)" })).toHaveCount(0);
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
