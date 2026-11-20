import { expect, test, type Page } from "@playwright/test";

/* Onglet Comparer : pas de débordement de la page (sinon le mobile dézoome), graphique lisible, zéro étiqueté. */

async function largeurs(page: Page) {
  return page.evaluate(() => ({ iw: window.innerWidth, sw: document.documentElement.scrollWidth }));
}

async function ouvrirParClic(page: Page) {
  await page.goto("/rentabilite");
  await page.getByRole("button", { name: "Voir une démo" }).click();
  await page.getByRole("tab", { name: "Comparer" }).click();
  await expect(page.locator("figure svg")).toBeVisible();
}

async function ouvrirParAncre(page: Page) {
  await page.goto("/rentabilite#comparer");
  await page.getByRole("button", { name: "Voir une démo" }).click();
  await expect(page.locator("figure svg")).toBeVisible();
}

for (const [nom, ouvrir] of [
  ["par clic sur l'onglet", ouvrirParClic],
  ["par l'ancre #comparer", ouvrirParAncre],
] as const) {
  test(`comparer ${nom} : la page ne déborde pas`, async ({ page }, info) => {
    await ouvrir(page);
    const { iw, sw } = await largeurs(page);
    if (info.project.name === "mobile") expect(iw).toBe(412);
    expect(sw).toBeLessThanOrEqual(iw);
  });
}

test("comparer à vide (aucun prix) : la page ne déborde pas non plus", async ({ page }, info) => {
  await page.goto("/rentabilite#comparer");
  await expect(page.getByRole("table", { name: /Profit espéré par couple/ })).toBeVisible();
  const { iw, sw } = await largeurs(page);
  if (info.project.name === "mobile") expect(iw).toBe(412);
  expect(sw).toBeLessThanOrEqual(iw);
});

test("comparer : seul le tableau défile horizontalement", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "défilement propre au mobile");
  await ouvrirParClic(page);
  const defile = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible" && e.clientWidth > 24)
      .map((e) => e.tagName),
  );
  expect(defile).toEqual(["DIV"]);
});

test("comparer : textes du graphique ≥ 12 px réels, zéro étiqueté", async ({ page }) => {
  await ouvrirParClic(page);
  const svg = page.locator("figure svg");
  const tailles = await svg.evaluate((el) => {
    const echelle = el.getBoundingClientRect().width / (el as SVGSVGElement).viewBox.baseVal.width;
    return [...el.querySelectorAll("text")].map((t) => parseFloat(getComputedStyle(t).fontSize) * echelle);
  });
  expect(tailles.length).toBeGreaterThan(8);
  for (const t of tailles) expect(t).toBeGreaterThanOrEqual(11.99);
  await expect(svg.locator("text", { hasText: /^0$/ })).toHaveCount(1);
});

/* Tolérance de 4 px : la boîte d'un texte est plus haute que ses glyphes. */
test("comparer : les repères de l'axe ne se chevauchent pas", async ({ page }) => {
  await ouvrirParClic(page);
  const ys = await page.locator("figure svg").evaluate((el) =>
    [...el.querySelectorAll("text")]
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.right < el.getBoundingClientRect().left + 60)
      .map((r) => ({ top: r.top, bottom: r.bottom }))
      .sort((a, b) => a.top - b.top),
  );
  expect(ys.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < ys.length; i++) expect(ys[i].top).toBeGreaterThanOrEqual(ys[i - 1].bottom - 4);
});
