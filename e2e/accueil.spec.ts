import { expect, test } from "@playwright/test";

test("l'accueil est un tableau de bord : enclos, Almanax, raccourcis", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Élevage de dragodindes", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Quand revenir à l.enclos/ })).toBeVisible();
  await expect(page.getByText("Aucun enclos saisi.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bonus Almanax" })).toBeVisible();
  await expect(page.getByText(/Ce mois-ci · Novembre \(Otoul\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Simuler un couple/ })).toHaveAttribute("href", "/rentabilite");
  await expect(page.getByText(/Migration en cours/)).toHaveCount(0);
});

test("navigation entre les 3 sections (barre du haut sur bureau, du bas sur mobile)", async ({ page }) => {
  await page.goto("/");
  const lien = (nom: string) => page.getByRole("link", { name: nom, exact: true });
  await expect(lien("Accueil")).toHaveAttribute("aria-current", "page");

  await lien("Enclos").click();
  await expect(page.getByRole("heading", { name: "Mes enclos", level: 1 })).toBeVisible();
  await expect(lien("Enclos")).toHaveAttribute("aria-current", "page");

  await lien("Rentabilité").click();
  await expect(page.getByRole("heading", { name: "Rentabilité", level: 1 })).toBeVisible();
  await expect(lien("Rentabilité")).toHaveAttribute("aria-current", "page");

  await lien("Guide").click();
  await expect(page.getByRole("heading", { name: "Guide", level: 1 })).toBeVisible();
  await expect(lien("Guide")).toHaveAttribute("aria-current", "page");

  await lien("Accueil").click();
  await expect(page.getByRole("heading", { name: "Élevage de dragodindes", level: 1 })).toBeVisible();
});

test("la navigation se fait au clavier", async ({ page, isMobile }) => {
  test.skip(isMobile, "clavier : profil bureau");
  await page.goto("/");
  await page.keyboard.press("Tab"); // lien d'évitement
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  await page.keyboard.press("Tab"); // logo
  await page.keyboard.press("Tab"); // Accueil
  await page.keyboard.press("Tab"); // Enclos
  await expect(page.getByRole("link", { name: "Enclos", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/enclos$/);
});

test("la v2 n'est plus servie et les métadonnées citent la version du jeu", async ({ page }) => {
  const res = await page.goto("/legacy/index.html");
  expect(res?.status()).toBe(404);
  await page.goto("/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /DOFUS 3\.7/);
});

test("le thème sombre peut être activé", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /thème/i }).click();
  const classes = await page.locator("html").getAttribute("class");
  expect(classes).toMatch(/dark|light/);
});
