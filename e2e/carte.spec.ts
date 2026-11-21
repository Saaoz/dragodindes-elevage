import { expect, test } from "@playwright/test";

test("carte : navigation, ouverture d'un nœud au clavier, lien vers l'endroit exact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: /^Navigation principale( \(mobile\))?$/ }).filter({ visible: true })
    .getByRole("link", { name: "Carte" }).click();
  await expect(page).toHaveURL(/\/carte$/);
  await expect(page.getByRole("heading", { name: "Carte du site", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pour les joueurs" })).toHaveAttribute("aria-selected", "true");

  const noeud = page.getByTestId("noeud-rentabilite-comparer");
  await noeud.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByTestId("detail");
  await expect(detail.getByRole("heading", { name: "Comparer" })).toBeVisible();
  await expect(detail.getByText("Visible en démo")).toBeVisible();

  await detail.getByRole("link", { name: "Ouvrir" }).click();
  await expect(page).toHaveURL(/\/rentabilite#comparer$/);
  await expect(page.getByRole("tab", { name: "Comparer" })).toHaveAttribute("aria-selected", "true");
});

test("carte : un nœud du guide ouvre la bonne section", async ({ page }) => {
  await page.goto("/carte");
  await page.getByTestId("noeud-guide-makinas").click();
  await page.getByTestId("detail").getByRole("link", { name: "Ouvrir" }).click();
  await expect(page).toHaveURL(/\/guide#makinas$/);
  await expect(page.locator("details#makinas")).toHaveAttribute("open", "");
});

test("carte : la liste équivalente donne les mêmes liens", async ({ page }) => {
  await page.goto("/carte");
  await page.getByTestId("liste-complete").locator("summary").click();
  await expect(page.getByTestId("liste-complete").getByRole("link", { name: "Prochaine tournée" })).toHaveAttribute(
    "href",
    "/enclos#titre-tournee",
  );
});

test("carte : onglets synchronisés avec #joueurs / #code", async ({ page }) => {
  await page.goto("/carte#code");
  await expect(page.getByRole("tab", { name: "Pour les développeurs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("carte-code")).toBeVisible();

  await page.getByRole("tab", { name: "Pour les joueurs" }).click();
  await expect(page).toHaveURL(/\/carte#joueurs$/);
  await expect(page.getByTestId("noeud-enclos-retour")).toBeVisible();
  await page.getByRole("tab", { name: "Pour les développeurs" }).click();
  await expect(page).toHaveURL(/\/carte#code$/);
});

test("carte du code : chercher, ouvrir un fichier, suivre une dépendance, lien GitHub", async ({ page }) => {
  await page.goto("/carte#code");
  const detail = page.getByTestId("detail-code");

  /* Recherche sans accents ni casse, Entrée ouvre le premier résultat. */
  await page.getByRole("searchbox", { name: "Chercher un fichier" }).fill("ENCLOS.TS");
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("heading", { name: "lib/enclos.ts" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: /^Testé par/ })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Voir sur GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/Saaoz/dragodindes-elevage/blob/main/lib/enclos.ts",
  );

  /* Une dépendance du panneau ouvre ce fichier. */
  await detail.getByRole("button", { name: "lib/enclos.test.ts" }).click();
  await expect(detail.getByRole("heading", { name: "lib/enclos.test.ts" })).toBeVisible();

  /* Sur la carte, au clavier. */
  const noeud = page.getByTestId("fichier-lib/store.ts");
  await noeud.focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("heading", { name: "lib/store.ts" })).toBeVisible();
  await expect(noeud).toHaveAttribute("aria-pressed", "true");

  /* Liste équivalente et source du graphe. */
  await page.getByTestId("liste-code").locator("summary").click();
  await page.getByTestId("liste-code").getByRole("button", { name: "app/guide/page.tsx" }).click();
  await expect(detail.getByRole("heading", { name: "app/guide/page.tsx" })).toBeVisible();
  await expect(page.getByTestId("carte-code-source")).toContainText(/Graphe analysé le \d+ \S+ \d{4}, au commit [0-9a-f]{7}/);
});

test("carte : pas de défilement horizontal, navigation lisible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const url of ["/carte", "/carte#code", "/"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const largeurs = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vue: document.documentElement.clientWidth,
    }));
    expect(largeurs.doc, url).toBeLessThanOrEqual(largeurs.vue);
  }
  const liens = page.getByRole("navigation", { name: "Navigation principale (mobile)" }).getByRole("link");
  await expect(liens).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const { scroll, client } = await liens.nth(i).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  }
});
