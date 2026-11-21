import { expect, test } from "@playwright/test";

test("guide : sections repliables, contenu de référence", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "Guide", level: 1 })).toBeVisible();
  const jauges = page.locator("details#jauges");
  await expect(jauges).not.toHaveAttribute("open", "");
  await jauges.locator("summary").click();
  await expect(jauges.getByRole("table", { name: "Tiers de jauge" })).toBeVisible();
  await expect(jauges.getByText("80 001 – 140 000")).toBeVisible();

  await page.getByRole("link", { name: "Sources et doutes" }).click();
  const sources = page.locator("details#sources");
  await expect(sources).toHaveAttribute("open", "");
  await expect(sources.getByRole("cell", { name: "Baffeur" })).toBeVisible();
});

test("guide : recherche de couleur (sans accents)", async ({ page }) => {
  await page.goto("/guide#croisements");
  const recherche = page.getByLabel("Chercher une couleur");
  await expect(recherche).toBeVisible();
  await recherche.fill("emeraude");
  await expect(page.getByRole("status").filter({ hasText: /couleurs? trouvées?/ })).toBeVisible();
  await expect(page.getByTestId("generation-9")).toBeVisible();
  await expect(page.getByTestId("generation-9").locator("mark")).toHaveText("Émeraude");
  await expect(page.getByTestId("generation-1")).toHaveCount(0);

  await recherche.fill("licorne");
  await expect(page.getByText("Aucune couleur trouvée")).toBeVisible();
  await recherche.fill("");
  await expect(page.getByTestId("generation-1")).toBeVisible();
});

test("guide : outil XP", async ({ page }) => {
  await page.goto("/guide#outils");
  await expect(page.getByText(/60,2 h/)).toBeVisible();
  await page.getByRole("switch", { name: /Sage/ }).click();
  await expect(page.getByText(/30,1 h/)).toBeVisible();
});

test("guide : section Capacités ouverte par son ancre, tableau et renvoi depuis Makinas", async ({ page }) => {
  await page.goto("/guide#capacites");
  const capacites = page.locator("details#capacites");
  await expect(capacites).toHaveAttribute("open", "");
  const tableau = capacites.getByRole("table", { name: "Capacités de monture" });
  await expect(tableau.getByRole("columnheader", { name: "Comment l'obtenir" })).toBeVisible();
  await expect(tableau.getByRole("cell", { name: "Sage", exact: true })).toBeVisible();
  await expect(tableau.getByRole("cell", { name: "Caméléone", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Capacités" }).first()).toBeVisible();

  await page.goto("/guide#makinas");
  await page.locator("details#makinas").getByRole("link", { name: "Capacités" }).click();
  await expect(page.locator("details#capacites")).toHaveAttribute("open", "");
});
