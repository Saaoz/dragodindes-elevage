import { expect, test, type Locator, type Page } from "@playwright/test";

async function saisir(page: Page) {
  await page.getByRole("region", { name: "Enclos 1" }).getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
}

/* #51 : un seul bouton de rappel par carte ; le choix de la méthode s'ouvre au premier appui. */
const boutonRappel = (carte: Locator) => carte.getByRole("button", { name: /^Me rappeler à/ });
const choix = (page: Page) => page.getByRole("dialog", { name: "Comment te rappeler ?" });
async function programmerAvec(page: Page, carte: Locator, methode: string | RegExp) {
  await boutonRappel(carte).click();
  await choix(page).getByRole("radio", { name: methode }).check();
  await choix(page).getByRole("button", { name: /^Me rappeler à/ }).click();
}

const etatLocal = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));

test("saisie d'un enclos : alerte ±5 000, heure de retour, persistance, agenda", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await saisir(page);

  await expect(carte.getByText(/Reviens avant 21 h 33/)).toBeVisible();
  await expect(carte.getByRole("alert")).toContainText("+5 000");
  await expect(carte.getByRole("alert")).toContainText("192 000 points");

  /* le plus urgent remonte en haut */
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Enclos 1");

  await page.reload();
  const carte2 = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte2.getByText(/Reviens avant 21 h 33/)).toBeVisible();
  await expect(carte2.getByRole("alert")).toContainText("+5 000");

  const download = page.waitForEvent("download");
  await programmerAvec(page, carte2, /Dans mon agenda/);
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/\.ics$/);
  const { readFile } = await import("node:fs/promises");
  const contenu = await readFile((await d.path())!, "utf8");
  expect(contenu).toContain("BEGIN:VEVENT");
  expect(contenu).toContain("BEGIN:VALARM");
  /* rappel 5 min avant le retour (21 h 33 min 20 s, heure locale) */
  /* tolérance ±2 s : l'horloge du test avance en temps réel pendant la saisie (figer l'horloge casse le titre de l'onglet) */
  const dtstart = /DTSTART:(\d{8}T\d{6}Z)/.exec(contenu)?.[1];
  expect(dtstart, "DTSTART absent du .ics").toBeDefined();
  const dtstartMs = Date.parse(dtstart!.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
  expect(Math.abs(dtstartMs - new Date(2026, 10, 20, 21, 28, 20).getTime())).toBeLessThanOrEqual(2000);

  await expect(carte2.getByTestId("etat-rappel")).toContainText(/Rappel : dans ton agenda, à 21\sh\s28\s✓/);
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
  await expect(boutonRappel(carte)).toHaveAccessibleName(/^Me rappeler à 21\sh\s28 pour l.enclos Enclos 1$/);

  await page.getByRole("group", { name: "Marge des rappels avant l'heure de retour" }).getByRole("button", { name: "15 min" }).click();
  await expect(boutonRappel(carte)).toHaveAccessibleName(/^Me rappeler à 21\sh\s18 /);

  await carte.getByRole("button", { name: "Rester en Maturité" }).click();
  await expect(carte.getByRole("button", { name: "Rester en Maturité" })).toHaveAttribute("aria-pressed", "true");
  await expect(carte.getByText(/sort de la zone Maturité/)).toBeVisible();

  await page.reload();
  const carte2 = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte2.getByRole("button", { name: "Rester en Maturité" })).toHaveAttribute("aria-pressed", "true");
  await expect(boutonRappel(carte2)).toBeVisible();
  await expect(page.getByRole("group", { name: "Marge des rappels avant l'heure de retour" }).getByRole("button", { name: "15 min" })).toHaveAttribute("aria-pressed", "true");
});

test("Rester en Maturité : au retour, le conseil inverse la jauge au lieu de « objectif déjà atteint » (#45)", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-1000");
  await page.getByRole("button", { name: /Ajouter une monture/ }).click();
  await page.getByLabel("Sérénité exacte de la monture 2").fill("1000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("50000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await carte.getByRole("button", { name: "Rester en Maturité" }).click();

  /* +1 000 atteint +2 000 après 1 000 points : au retour, Sérénité − pour recentrer le groupe */
  await expect(carte.getByText(/sort de la zone Maturité/)).toBeVisible();
  await expect(
    carte.getByText(/À ton retour\s*: passe sur la jauge Sérénité − et mets 1\s000 points au total pour recentrer tes montures dans la zone Maturité\./),
  ).toBeVisible();
  await expect(carte.getByText(/déjà atteint/)).toHaveCount(0);
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
  /* en démo : un appui explique qu'aucun rappel réel n'est programmé, sans choix ni téléchargement */
  await boutonRappel(demo).click();
  await expect(demo.getByTestId("annonce-rappel")).toContainText("Mode démo : aucun rappel réel n’est programmé");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(demo.getByTestId("etat-rappel")).toHaveCount(0);
  await demo.getByRole("button", { name: "Rester en Maturité" }).click();
  await page.getByRole("button", { name: "30 min" }).click();
  expect(await etatLocal(page)).toBe(avant);
  await page.getByRole("button", { name: "Quitter la démo" }).first().click();
  await expect(page.getByTestId("banniere-demo")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Enclos 1 (démo)" })).toHaveCount(0);
});

test("sans variables d'environnement : pas de choix « téléphone », ni explication inutile ; agenda toujours disponible", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await boutonRappel(carte).click();
  const dialogue = choix(page);
  await expect(dialogue).toBeVisible();
  await expect(dialogue.getByRole("radio", { name: /Sur mon téléphone/ })).toHaveCount(0);
  await expect(dialogue.getByTestId("sans-push")).toHaveCount(0);
  await expect(dialogue.getByRole("radio", { name: /Dans mon agenda/ })).toBeChecked();
  await expect(dialogue.getByRole("radio", { name: /Dans Google Agenda/ })).toBeVisible();
  await expect(page.getByText(/pas encore configurées sur ce serveur/)).toHaveCount(0);

  const download = page.waitForEvent("download");
  await dialogue.getByRole("button", { name: /^Me rappeler à/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
});

test("premier appui → choix → rappel programmé → état ; deuxième enclos → un seul appui", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisirTous(page);
  const c1 = page.getByRole("region", { name: "Enclos 1" });
  const c2 = page.getByRole("region", { name: "Enclos 2" });
  /* une seule action de rappel par carte, plus de bandeau d'explications */
  await expect(page.getByRole("button", { name: /^Me rappeler à/ })).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Ajouter à mon agenda|Me prévenir dans cet onglet|Recevoir une notification/ })).toHaveCount(0);
  await expect(page.getByTestId("aide-notifications")).toHaveCount(0);
  await expect(c1.getByTestId("etat-rappel")).toHaveCount(0);

  /* premier appui : le choix s'ouvre, le focus est dedans, sur la meilleure méthode */
  await boutonRappel(c1).click();
  await expect(choix(page)).toBeVisible();
  await expect(choix(page).getByRole("radio", { name: /Dans mon agenda/ })).toBeFocused();
  const dl1 = page.waitForEvent("download");
  await choix(page).getByRole("button", { name: /^Me rappeler à/ }).click();
  await dl1;
  await expect(choix(page)).toHaveCount(0);
  await expect(boutonRappel(c1)).toBeFocused();
  await expect(c1.getByTestId("annonce-rappel")).toHaveText(/^Rappel programmé à \d\d\sh\s\d\d$/);
  await expect(c1.getByTestId("etat-rappel")).toContainText(/Rappel : dans ton agenda, à \d\d\sh\s\d\d\s✓/);

  /* deuxième enclos : la méthode est mémorisée, un seul appui télécharge directement */
  await expect(c2.getByTestId("methode-rappel")).toContainText("Façon de te rappeler : dans ton agenda");
  const dl2 = page.waitForEvent("download");
  await boutonRappel(c2).click();
  expect((await dl2).suggestedFilename()).toMatch(/\.ics$/);
  await expect(choix(page)).toHaveCount(0);
  await expect(c2.getByTestId("etat-rappel")).toContainText("Rappel : dans ton agenda");

  /* la méthode survit au rechargement */
  await page.reload();
  await expect(page.getByRole("region", { name: "Enclos 3" }).getByTestId("methode-rappel")).toContainText("dans ton agenda");
});

test("« changer » rouvre le choix avec la méthode actuelle ; Google Agenda s'ouvre dans un nouvel onglet", async ({ page, context }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const dl = page.waitForEvent("download");
  await programmerAvec(page, carte, /Dans mon agenda/);
  await dl;

  await carte.getByRole("button", { name: /Changer la façon d.être rappelé pour l.enclos Enclos 1/ }).click();
  await expect(choix(page)).toBeVisible();
  await expect(choix(page).getByRole("radio", { name: /Dans mon agenda/ })).toBeChecked();
  await context.route(/calendar\.google\.com/, (r) => r.fulfill({ body: "<title>Google Agenda</title>", contentType: "text/html" }));
  const popup = context.waitForEvent("page");
  await choix(page).getByRole("radio", { name: /Dans Google Agenda/ }).check();
  await choix(page).getByRole("button", { name: /^Me rappeler à/ }).click();
  const onglet = await popup;
  expect(onglet.url()).toMatch(/^https:\/\/calendar\.google\.com\//);
  await expect(carte.getByTestId("etat-rappel")).toContainText("Rappel : dans Google Agenda");
  await onglet.close();

  /* « Annuler le rappel » retire l'état */
  await carte.getByRole("button", { name: /Changer la façon/ }).click();
  await choix(page).getByRole("button", { name: "Annuler le rappel" }).click();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
  await expect(carte.getByTestId("annonce-rappel")).toHaveText("Rappel annulé");
});

test("rappel dans la page : notification autorisée, état affiché, annonce vocale, notification à l'heure", async ({ page }) => {
  await page.addInitScript(() => {
    const envoyees: string[] = [];
    (window as unknown as { __notifs: string[] }).__notifs = envoyees;
    class FausseNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(titre: string) {
        envoyees.push(titre);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FausseNotification;
  });
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await programmerAvec(page, carte, /tant que la page reste ouverte/);
  await expect(carte.getByTestId("etat-rappel")).toContainText(/Rappel : dans cette page, tant qu.elle reste ouverte, à 21\sh\s28/);
  await expect(carte.getByTestId("annonce-rappel")).toContainText(/Rappel programmé à 21\sh\s28/);
  await page.clock.fastForward("00:29:00");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notifs: string[] }).__notifs)).toEqual(["Enclos 1 : reviens maintenant"]);
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
});

test("clavier seul : ouvrir le choix, choisir avec les flèches, valider ; Échap ferme et rend le focus", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const bouton = boutonRappel(carte);
  await bouton.focus();
  await page.keyboard.press("Enter");
  await expect(choix(page)).toBeVisible();
  const agenda = choix(page).getByRole("radio", { name: /Dans mon agenda/ });
  await expect(agenda).toBeFocused();

  /* Échap ferme sans rien programmer, le focus revient au bouton */
  await page.keyboard.press("Escape");
  await expect(choix(page)).toHaveCount(0);
  await expect(bouton).toBeFocused();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);

  /* flèche bas : Google Agenda ; Tab : « Fermer », puis « Me rappeler » ; le focus reste dans le dialogue */
  await page.keyboard.press("Enter");
  await expect(agenda).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choix(page).getByRole("radio", { name: /Dans Google Agenda/ })).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(agenda).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(choix(page).getByRole("button", { name: "Fermer" })).toBeFocused();
  await page.keyboard.press("Tab");
  const valider = choix(page).getByRole("button", { name: /^Me rappeler à/ });
  await expect(valider).toBeFocused();
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await valider.focus();
  const dl = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  await dl;
  await expect(choix(page)).toHaveCount(0);
  await expect(bouton).toBeFocused();

  /* « changer » est atteignable au clavier et rouvre le choix */
  await carte.getByRole("button", { name: /Changer la façon/ }).focus();
  await page.keyboard.press("Enter");
  await expect(choix(page)).toBeVisible();
});

test("cibles tactiles d'au moins 44 px : bouton de rappel et « changer »", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const taille = async (l: Locator) => (await l.boundingBox())!;
  expect((await taille(boutonRappel(carte))).height).toBeGreaterThanOrEqual(44);
  const dl = page.waitForEvent("download");
  await programmerAvec(page, carte, /Dans mon agenda/);
  await dl;
  expect((await taille(carte.getByRole("button", { name: /Changer la façon/ }))).height).toBeGreaterThanOrEqual(44);
  await carte.getByRole("button", { name: /Changer la façon/ }).click();
  for (const b of await choix(page).getByRole("button").all()) expect((await taille(b)).height).toBeGreaterThanOrEqual(44);
  for (const r of await choix(page).locator("label").all()) expect((await taille(r)).height).toBeGreaterThanOrEqual(44);
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

test("retour dépassé (#31) : vraie durée de retard, alerte au passé, pas d'agenda, l'enclos reste sur l'accueil", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page); // −3 000, Sérénité + pleine : +5 000 atteint à 21 h 33 min 20 s
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await expect(carte.getByText(/Reviens avant 21 h 33/)).toBeVisible();

  /* le joueur revient 1 h 26 min 40 s après l'heure de retour (23 h 00) */
  await page.clock.fastForward("02:00:00");
  await expect(carte.getByText("Retour dépassé depuis 1 h 26 min")).toBeVisible();
  await expect(carte.getByText(/La monture 1 est à \+5 000 depuis 21 h 33, 18 600 points de jauge gaspillés/)).toBeVisible();
  await expect(carte.getByRole("alert")).toContainText("a atteint +5 000 à 21 h 33");
  await expect(carte.getByRole("alert")).not.toContainText("atteindra");
  await expect(carte.getByText(/clique « Je quitte l’enclos »/)).toBeVisible();
  await expect(carte.getByText(/Objectif déjà atteint/)).toHaveCount(0);
  await expect(carte.getByText(/pas besoin de revenir/)).toHaveCount(0);
  await expect(boutonRappel(carte)).toHaveCount(0);
  await expect(carte.getByTestId("rappel")).toHaveCount(0);
  await expect(page).toHaveTitle(/^En retard · Enclos 1/);

  /* la durée avance avec l'horloge (elle ne reste plus bloquée à 0 s) */
  await page.clock.fastForward("00:10:00");
  await expect(carte.getByText("Retour dépassé depuis 1 h 36 min")).toBeVisible();

  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  const lien = page.getByRole("link", { name: /Enclos 1.*Retour dépassé/ });
  await expect(lien).toBeVisible();
  await expect(lien).toContainText("depuis 1 h 36 min · la monture 1 est à +5 000 depuis 21 h 33");
});

test("retour dépassé (#31) : jauge vidée sans borne atteinte, toujours visible et sur l'accueil", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-4000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("3000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(carte.getByText(/Reviens avant 21 h 50/)).toBeVisible();

  await page.clock.fastForward("02:00:00");
  await expect(carte.getByText("Retour dépassé depuis 1 h 10 min")).toBeVisible();
  await expect(carte.getByText("Jauge Sérénité + vide depuis 21 h 50.")).toBeVisible();
  await expect(carte.getByText(/Jauge Sérénité \+ : vide depuis 21 h 50/)).toBeVisible();
  await expect(carte.getByText(/Aucune jauge de sérénité active/)).toHaveCount(0);
  await expect(boutonRappel(carte)).toHaveCount(0);

  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  await expect(page.getByRole("link", { name: /Enclos 1.*Retour dépassé.*jauge Sérénité \+ vide depuis 21 h 50/ })).toBeVisible();
  await expect(page.getByText(/Aucune jauge de sérénité active/)).toHaveCount(0);
});

/* #38 : deux onglets du même navigateur ne doivent jamais s'écraser mutuellement. */
async function saisirEnclos(page: Page, n: number) {
  await page.getByRole("region", { name: `Enclos ${n}` }).getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(page.getByRole("region", { name: `Enclos ${n}` }).getByText(/Reviens avant/)).toBeVisible();
}
const marge = (page: Page, min: number) =>
  page.getByRole("group", { name: "Marge des rappels avant l'heure de retour" }).getByRole("button", { name: `${min} min` });

test("deux onglets : un enclos saisi dans B survit à un réglage changé dans A, puis au rechargement de B", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/enclos");
  await b.goto("/enclos");
  await saisirEnclos(b, 5);
  await marge(a, 15).click();
  await expect(marge(a, 15)).toHaveAttribute("aria-pressed", "true");
  await b.reload();
  await expect(b.getByRole("region", { name: "Enclos 5" }).getByText(/Reviens avant/)).toBeVisible();
  await expect(marge(b, 15)).toHaveAttribute("aria-pressed", "true");
});

test("deux onglets : un réglage changé dans A survit à une saisie faite dans B", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/enclos");
  await b.goto("/enclos");
  await marge(a, 30).click();
  await expect(marge(a, 30)).toHaveAttribute("aria-pressed", "true");
  await saisirEnclos(b, 5);
  await a.reload();
  await expect(marge(a, 30)).toHaveAttribute("aria-pressed", "true");
  await expect(a.getByRole("region", { name: "Enclos 5" }).getByText(/Reviens avant/)).toBeVisible();
});

async function saisirTous(page: Page) {
  for (let i = 1; i <= 4; i++) {
    const carte = page.getByRole("region", { name: `Enclos ${i}` });
    await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
    await carte.getByLabel("Sérénité exacte de la monture 1").fill(String(-3000 + i * 500));
    await carte.getByRole("button", { name: "Sérénité +" }).click();
    await carte.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
    await carte.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(carte.getByText(/Reviens avant/)).toBeVisible();
  }
}

test("« Vider cet enclos » demande confirmation ; « Garder » conserve la saisie, « Oui, vider » l'efface", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });

  await carte.getByRole("button", { name: "Vider cet enclos" }).click();
  await expect(carte.getByRole("group", { name: "Vider Enclos 1" })).toBeVisible();
  await expect(carte.getByRole("button", { name: "Garder" })).toBeFocused();
  await carte.getByRole("button", { name: "Garder" }).click();
  await expect(carte.getByText(/Reviens avant/)).toBeVisible();
  await expect(carte.getByRole("group", { name: "Vider Enclos 1" })).toHaveCount(0);

  await carte.getByRole("button", { name: "Vider cet enclos" }).click();
  await carte.getByRole("button", { name: "Oui, vider" }).click();
  await expect(carte.getByRole("button", { name: "Saisir cet enclos" })).toBeVisible();
  await expect(carte.getByText(/Reviens avant/)).toHaveCount(0);
});

test("claviers mobiles : sérénité négative tapée au clavier texte (« -3000 »), niveau « 200k » et kamas", async ({ page }) => {
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();

  const serenite = page.getByLabel("Sérénité exacte de la monture 1");
  await expect(serenite).toHaveAttribute("inputmode", "text");

  await serenite.fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await expect(page.getByPlaceholder("ex. 200000 ou 85k")).toHaveAttribute("inputmode", "text");
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200k");
  await page.getByRole("button", { name: /Enregistrer/ }).click();

  await expect(carte.getByText(/−3[\s  ]000/).first()).toBeVisible();

  await page.goto("/rentabilite");
  await page.getByRole("button", { name: "Génération 2" }).click();
  await expect(page.getByLabel("Prix : Monture gén. 2", { exact: true })).toHaveAttribute("inputmode", "text");
});
