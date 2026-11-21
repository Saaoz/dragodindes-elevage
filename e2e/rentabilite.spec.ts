import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_V2 = path.join(__dirname, "..", "lib", "__fixtures__", "export-v2.json");
const etatLocal = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));

async function prix(page: Page, label: string, valeur: string) {
  const champ = page.getByLabel(`Prix : ${label}`, { exact: true });
  await champ.fill(valeur);
  await champ.press("Enter");
}

test("mode simple : génération cible + 3 prix → verdict, enregistré", async ({ page }) => {
  await page.goto("/rentabilite");
  const verdict = page.getByTestId("verdict");
  await expect(verdict).toContainText("Il manque 4 prix");

  await page.getByRole("button", { name: "Génération 2" }).click();
  await expect(verdict).toContainText("Il manque 3 prix");
  await prix(page, "Monture gén. 2", "200k");
  await prix(page, "Monture gén. 1", "20 000");
  await expect(verdict).toContainText("Il manque 1 prix");
  await prix(page, "Optimakina gén. 2", "10k");
  /* valeurs historiques : sans taxe (la taxe a son propre test) */
  await page.getByRole("button", { name: /Vente directe/ }).click();

  /* chance 80 % : 0,8 × 150 000 + 0,2 × (−30 000) = +114 000 */
  await expect(verdict).toContainText("Rentable");
  await expect(verdict).toContainText(/\+114.000 kamas/);
  await expect(verdict).toContainText("80 %");

  await page.reload();
  await expect(page.getByTestId("verdict")).toContainText(/\+114.000 kamas/);
  await expect(page.getByLabel("Prix : Monture gén. 2", { exact: true })).toHaveValue(/200.000/);
});

test("mode avancé : replié par défaut, tous les réglages, recalcul", async ({ page }) => {
  await page.goto("/rentabilite");
  await page.getByRole("button", { name: "Génération 2" }).click();
  await prix(page, "Monture gén. 2", "200k");
  await prix(page, "Monture gén. 1", "20k");
  await prix(page, "Optimakina gén. 2", "10k");

  const niveauA = page.getByLabel("Parent A : niveau (1-200)");
  await expect(niveauA).toBeHidden();
  await page.getByRole("button", { name: /Mode avancé/ }).click();
  await expect(niveauA).toBeVisible();
  await expect(page.getByRole("button", { name: "+20 % (3.7)" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("switch", { name: "Takeza (Almanax)" }).click();
  await expect(page.getByTestId("verdict")).toContainText("100 %");

  await page.getByRole("switch", { name: "Utiliser une Optimakina" }).click();
  await expect(page.getByLabel("Prix : Optimakina gén. 2", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+20 % (3.7)" })).toBeDisabled();
});

test("import d'un export v2 dans « Mes prix »", async ({ page }) => {
  await page.goto("/rentabilite#prix");
  await expect(page.getByRole("tab", { name: "Mes prix" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "sur GitHub" })).toHaveAttribute("href", /34f71ad\/legacy/);
  page.on("dialog", (d) => void d.accept());
  await page.getByLabel("Fichier JSON à importer").setInputFiles({
    name: "dragodindes-prix-v2.json",
    mimeType: "application/json",
    buffer: readFileSync(FIXTURE_V2),
  });
  await expect(page.getByRole("status").filter({ hasText: "Import terminé" })).toBeVisible();
  await expect(page.getByLabel("Serveur")).toHaveValue("Imagiro");
  await expect(page.getByLabel("Prix : Génération 5", { exact: true })).toHaveValue(/310.000/);
  await expect(page.getByLabel("Prix : Optimakina gén. 7", { exact: true })).toHaveValue(/150.000/);
  await expect(page.getByText("15 / 21 prix renseignés")).toBeVisible();

  await page.getByLabel("Serveur").selectOption("Orukam");
  await expect(page.getByLabel("Prix : Génération 6", { exact: true })).toHaveValue(/1.180.000/);
});

test("collage d'une liste de prix", async ({ page }) => {
  await page.goto("/rentabilite#prix");
  await page.getByLabel("Liste de prix à coller").fill("5 300k\nneurone 25k\nn'importe quoi");
  await page.getByRole("button", { name: "Importer ce texte" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 prix importés" })).toContainText("1 ligne(s) ignorée(s)");
  await expect(page.getByLabel("Prix : Génération 5", { exact: true })).toHaveValue(/300.000/);
  await expect(page.getByText("aujourd'hui").filter({ visible: true }).first()).toBeVisible();
});

test("mode démo : prix fictifs, bannière, aucune écriture", async ({ page }) => {
  await page.goto("/rentabilite");
  await expect(page.getByTestId("verdict")).toBeVisible();
  const avant = await etatLocal(page);
  await page.getByRole("button", { name: "Voir une démo" }).click();
  await expect(page.getByTestId("banniere-demo")).toContainText("Mode démo");
  await expect(page.getByTestId("verdict")).toContainText(/Rentable|Pas rentable|équilibre/);

  await prix(page, "Monture gén. 5", "9M");
  await page.getByRole("tab", { name: "Mes prix" }).click();
  await expect(page.getByRole("button", { name: "Importer un JSON" })).toBeDisabled();
  await page.getByRole("tab", { name: "Comparer" }).click();
  await expect(page.getByRole("table", { name: /Profit espéré par couple/ }).getByRole("row")).toHaveCount(8);
  expect(await etatLocal(page)).toBe(avant);

  await page.getByRole("button", { name: "Quitter la démo" }).first().click();
  await expect(page.getByTestId("banniere-demo")).toHaveCount(0);
  expect(await etatLocal(page)).toBe(avant);
});

test("comparatif : heatmap serveurs × génération et graphique", async ({ page }) => {
  await page.goto("/rentabilite#comparer");
  const table = page.getByRole("table", { name: /Profit espéré par couple/ });
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByText("aucun prix").first()).toBeVisible();
  await expect(page.getByText(/Renseigne les prix des générations/)).toBeVisible();
  await page.getByRole("button", { name: "Génération 1 (capturée)" }).click();
  await expect(page.getByRole("button", { name: "Génération 1 (capturée)" })).toHaveAttribute("aria-pressed", "true");
});

test("lieu de vente : 2 % par défaut, change le verdict et le détail, mémorisé", async ({ page }) => {
  await page.goto("/rentabilite");
  await page.getByRole("button", { name: "Génération 2" }).click();
  await prix(page, "Monture gén. 2", "200k");
  await prix(page, "Monture gén. 1", "20k");
  await prix(page, "Optimakina gén. 2", "10k");
  const verdict = page.getByTestId("verdict");
  const taxe = page.getByTestId("ligne-taxe");
  await page.getByText("Détail du calcul").click();

  /* défaut : Bonta/Brâkmar, autre alignement, 2 % */
  await expect(page.getByRole("button", { name: /autre alignement/ })).toHaveAttribute("aria-pressed", "true");
  await expect(verdict).toContainText(/\+110.720 kamas/);
  await expect(taxe).toContainText(/Taxe HDV \(2.%\)/);

  await page.getByRole("button", { name: /Astrub/ }).click();
  await expect(verdict).toContainText(/\+105.800 kamas/);
  await expect(taxe).toContainText(/Taxe HDV \(5.%\)/);

  await page.getByRole("button", { name: /Vente directe/ }).click();
  await expect(verdict).toContainText(/\+114.000 kamas/);
  await expect(taxe).toContainText("aucune");

  await page.getByRole("button", { name: /Astrub/ }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Astrub/ })).toHaveAttribute("aria-pressed", "true");
});
