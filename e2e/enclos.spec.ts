import fs from "node:fs";
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

  /* #57 : l'heure de retour n'est écrite qu'une fois, aucune note de développeur, pas de rouge à plus de 30 min */
  await expect(carte.getByText(/21\sh\s33/)).toHaveCount(1);
  await expect(carte.getByText(/à vérifier en jeu|carburant/)).toHaveCount(0);
  await expect(carte).toHaveAttribute("data-urgent", "false");

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

  await expect(carte2.getByTestId("etat-rappel")).toContainText(/Rappel programmé à 21\sh\s28\s\(dans ton agenda\)/);
  /* le gros bouton a laissé la place à l'état : un nouvel appui ne peut plus dupliquer l'événement */
  await expect(boutonRappel(carte2)).toHaveCount(0);
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

test("choix du rappel : agenda par défaut, Google Agenda, pas de notification push (retirée)", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await boutonRappel(carte).click();
  const dialogue = choix(page);
  await expect(dialogue).toBeVisible();
  await expect(dialogue.getByRole("radio", { name: /Sur mon téléphone/ })).toHaveCount(0);
  await expect(dialogue.getByRole("radio", { name: /Dans mon agenda/ })).toBeChecked();
  await expect(dialogue.getByRole("radio", { name: /Dans Google Agenda/ })).toBeVisible();

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
  /* le gros bouton disparaît : le focus passe à « changer » */
  await expect(c1.getByRole("button", { name: /Changer la façon/ })).toBeFocused();
  await expect(boutonRappel(c1)).toHaveCount(0);
  await expect(c1.getByTestId("annonce-rappel")).toHaveText(/^Rappel programmé à \d\d\sh\s\d\d$/);
  await expect(c1.getByTestId("etat-rappel")).toContainText(/^✓ Rappel programmé à \d\d\sh\s\d\d\s\(dans ton agenda\)/);

  /* deuxième enclos : la méthode est mémorisée, un seul appui télécharge directement */
  await expect(c2.getByTestId("methode-rappel")).toContainText("Façon de te rappeler : dans ton agenda");
  const dl2 = page.waitForEvent("download");
  await boutonRappel(c2).click();
  expect((await dl2).suggestedFilename()).toMatch(/\.ics$/);
  await expect(choix(page)).toHaveCount(0);
  await expect(c2.getByTestId("etat-rappel")).toContainText("Rappel programmé");

  /* la méthode et les rappels survivent au rechargement */
  await page.reload();
  await expect(page.getByRole("region", { name: "Enclos 3" }).getByTestId("methode-rappel")).toContainText("dans ton agenda");
  await expect(page.getByRole("region", { name: "Enclos 1" }).getByTestId("etat-rappel")).toBeVisible();
  await expect(page.getByRole("region", { name: "Enclos 2" }).getByTestId("etat-rappel")).toBeVisible();
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
  await expect(carte.getByTestId("etat-rappel")).toContainText(/Rappel programmé à .* \(dans Google Agenda\)/);
  await onglet.close();

  /* « Annuler le rappel » retire l'état, le gros bouton revient (focus dessus) et l'événement à supprimer est rappelé */
  await carte.getByRole("button", { name: /Changer la façon/ }).click();
  await choix(page).getByRole("button", { name: "Annuler le rappel" }).click();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
  await expect(boutonRappel(carte)).toBeVisible();
  await expect(boutonRappel(carte)).toBeFocused();
  await expect(carte.getByTestId("annonce-rappel")).toHaveText("Rappel annulé");
  await expect(carte.getByTestId("ancien-rappel")).toContainText(/Pense à supprimer l.ancien rappel de 21\sh\s28 dans Google Agenda/);
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
  await expect(carte.getByTestId("etat-rappel")).toContainText(/Rappel programmé à 21\sh\s28\s\(dans cette page, tant qu.elle reste ouverte\)/);
  await expect(carte.getByTestId("annonce-rappel")).toContainText(/Rappel programmé à 21\sh\s28/);
  /* « dans la page » n'est pas mémorisé : après un rechargement, le bouton revient (et rien n'est persisté) */
  await page.reload();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
  await expect(boutonRappel(carte)).toBeVisible();
  await boutonRappel(carte).click(); // la méthode « page » est mémorisée : un seul appui
  await expect(carte.getByTestId("etat-rappel")).toBeVisible();
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
  await expect(carte.getByRole("button", { name: /Changer la façon/ })).toBeFocused();

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

test("un lien /enclos#enclos-3 ouvre l'enclos concerné", async ({ page }) => {
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
  await expect(carte.getByRole("alert")).toContainText(/jusqu’à 192\s000 points de jauge seront gaspillés/);
  await expect(carte.getByText(/21\sh\s33/)).toHaveCount(1);
  await expect(carte).toHaveAttribute("data-urgent", "true");
  await expect(carte.getByRole("alert")).not.toContainText("atteindra");
  await expect(carte.getByText(/clique « Je quitte l’enclos »/)).toBeVisible();
  /* #64 : en retard, un conseil chiffré calculé sur l'état estimé maintenant, sous le titre */
  await expect(carte.getByTestId("conseil-maintenant")).toHaveText(
    /^Maintenant\s*: passe sur la jauge Sérénité − et mets 10\s000 points au total\s*: c'est le maximum avant qu'une monture atteigne −5\s000\.$/,
  );
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

test("Tardif (#64) : aperçu en direct dans la saisie, état au bord → « À faire maintenant », jamais « Retour dépassé depuis 1 s »", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 20, 0, 0) });
  await page.goto("/enclos");
  await page.getByRole("region", { name: "Enclos 1" }).getByRole("button", { name: "Saisir cet enclos" }).click();
  const apercu = page.getByTestId("apercu-saisie");
  const annonceApercu = page.getByTestId("annonce-apercu");
  /* la région polie existe avant son contenu ; brouillon incomplet : aperçu neutre, pas d'erreur */
  await expect(annonceApercu).toHaveAttribute("aria-live", "polite");
  await expect(apercu).toHaveText(/s’affichera ici/);
  await expect(page.getByRole("form", { name: "Saisie de l'enclos" }).getByRole("alert")).toHaveCount(0);

  await page.getByLabel("Nom de l'enclos").fill("Tardif");
  await page.getByLabel("Sérénité exacte de la monture 1").fill("5000");
  await page.getByRole("button", { name: /Ajouter une monture/ }).click();
  await page.getByLabel("Sérénité exacte de la monture 2").fill("4800");
  await page.getByRole("button", { name: /Ajouter une monture/ }).click();
  await page.getByLabel("Sérénité exacte de la monture 3").fill("5000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  const niveau = page.getByPlaceholder("ex. 200000 ou 85k");
  await niveau.fill("160k");

  /* ce que le joueur voit en arrivant : quoi faire tout de suite, et combien */
  await expect(apercu).toContainText("Avec cette saisie : à faire maintenant.");
  await expect(apercu).toContainText(/Passe sur la jauge Sérénité − et mets 9\s800 points au total/);
  /* annoncé poliment après la frappe, sans voler le focus */
  await expect(annonceApercu).toHaveText(/^Avec cette saisie : à faire maintenant\. Passe sur la jauge Sérénité −/);
  await expect(niveau).toBeFocused();

  /* il essaie le conseil : l'aperçu donne l'heure de retour avant d'enregistrer, à chaque frappe */
  await page.getByRole("button", { name: "Sérénité −" }).click();
  await niveau.fill("9800");
  await expect(apercu).toContainText(/Avec cette saisie : reviens avant 22\sh\s43\./);
  await niveau.pressSequentially("0");
  await expect(apercu).not.toContainText(/22\sh\s43/);
  await expect(niveau).toBeFocused();

  /* … mais enregistre ce qu'il voit (issue : Sérénité + 160k) */
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await niveau.fill("160k");
  await page.getByRole("button", { name: /Enregistrer/ }).click();

  const carte = page.getByRole("region", { name: "Tardif" });
  await expect(carte.getByText("À faire maintenant", { exact: true })).toBeVisible();
  await expect(carte.getByText(/^La jauge Sérénité \+ pousse la monture 1 à \+5\s000\.$/)).toBeVisible();
  await expect(carte.getByTestId("conseil-maintenant")).toHaveText(
    /^Passe sur la jauge Sérénité − et mets 9\s800 points au total\s*: c'est le maximum avant qu'une monture atteigne −5\s000\.$/,
  );
  await expect(carte.getByText(/Retour dépassé/)).toHaveCount(0);
  await expect(carte.getByText(/Retourne à l’enclos/)).toHaveCount(0);
  await expect(carte.getByRole("alert")).toContainText(/si rien ne change/);
  await expect(carte.getByRole("alert")).not.toContainText(/si tu ne reviens pas/);
  await expect(carte).toHaveAttribute("data-urgent", "true");
  /* pas de rappel dans le passé (#31) */
  await expect(boutonRappel(carte)).toHaveCount(0);
  await expect(page.getByTestId("annonce-enclos")).toHaveText(/^Tardif enregistré : à faire maintenant\. Passe sur la jauge Sérénité − et mets 9\s800 points/);
  await expect(page).toHaveTitle(/^À faire · Tardif · Mes enclos$/);
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Tardif");

  /* quelques secondes plus tard : toujours pas de « retour dépassé » */
  await page.clock.fastForward(5_000);
  await expect(carte.getByText("À faire maintenant", { exact: true })).toBeVisible();
  await expect(carte.getByText(/Retour dépassé/)).toHaveCount(0);

  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  const lien = page.getByRole("link", { name: /Tardif.*À faire maintenant/ });
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute("data-urgent", "true");
  await expect(lien).not.toContainText(/Retour dépassé|depuis/);
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

/* #53 : le rappel programmé est mémorisé par enclos et survit au rechargement ; la ressaisie le réinitialise. */
const changer = (carte: Locator) => carte.getByRole("button", { name: /Changer la façon/ });

async function ressaisir(page: Page, carte: Locator, serenite: string) {
  await carte.getByRole("button", { name: "Je quitte l’enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill(serenite);
  await page.getByRole("button", { name: /Enregistrer/ }).click();
}

test("agenda programmé → rechargement : « Rappel programmé ✓ » visible, pas de gros bouton ; ressaisie → le bouton revient avec la mention de l'ancien événement", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const dl = page.waitForEvent("download");
  await programmerAvec(page, carte, /Dans mon agenda/);
  await dl;
  await expect(carte.getByTestId("etat-rappel")).toContainText(/^✓ Rappel programmé à 21\sh\s28\s\(dans ton agenda\)/);

  await page.reload();
  await expect(carte.getByTestId("etat-rappel")).toContainText(/Rappel programmé à 21\sh\s28\s\(dans ton agenda\)/);
  await expect(boutonRappel(carte)).toHaveCount(0);
  await expect(carte.getByTestId("ancien-rappel")).toHaveCount(0);
  const stocke = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([k]) => k.includes("dd"))![1]).state.enclos[0].rappel);
  expect(stocke).toMatchObject({ methode: "agenda" });

  /* ressaisie avec une autre sérénité : l'heure de retour change, le gros bouton revient */
  await ressaisir(page, carte, "-1000");
  await expect(boutonRappel(carte)).toBeVisible();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
  await expect(carte.getByTestId("ancien-rappel")).toContainText(/^Pense à supprimer l.ancien rappel de 21\sh\s28 dans ton agenda/);
  /* la mention survit au rechargement et disparaît avec l'heure de l'ancien événement */
  await page.reload();
  await expect(carte.getByTestId("ancien-rappel")).toBeVisible();
  await page.clock.fastForward("00:30:00");
  await expect(carte.getByTestId("ancien-rappel")).toHaveCount(0);
});

test("Google Agenda programmé → rechargement → état ; ressaisie → bouton + mention « Google Agenda »", async ({ page, context }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await context.route(/calendar\.google\.com/, (r) => r.fulfill({ body: "<title>Google Agenda</title>", contentType: "text/html" }));
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const popup = context.waitForEvent("page");
  await programmerAvec(page, carte, /Dans Google Agenda/);
  await (await popup).close();
  await page.reload();
  await expect(carte.getByTestId("etat-rappel")).toContainText(/Rappel programmé à 21\sh\s28\s\(dans Google Agenda\)/);
  await expect(boutonRappel(carte)).toHaveCount(0);
  await ressaisir(page, carte, "-1000");
  await expect(boutonRappel(carte)).toBeVisible();
  await expect(carte.getByTestId("ancien-rappel")).toContainText(/ancien rappel de 21\sh\s28 dans Google Agenda/);
});

test("« changer » → « Annuler le rappel » : le bouton revient après rechargement aussi ; « Vider » réinitialise le rappel", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const dl = page.waitForEvent("download");
  await programmerAvec(page, carte, /Dans mon agenda/);
  await dl;
  await changer(carte).click();
  await choix(page).getByRole("button", { name: "Annuler le rappel" }).click();
  await expect(boutonRappel(carte)).toBeVisible();
  await page.reload();
  await expect(boutonRappel(carte)).toBeVisible();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);

  /* reprogrammé puis vidé : plus aucun état, la mention de l'événement à supprimer est affichée */
  const dl2 = page.waitForEvent("download");
  await boutonRappel(carte).click();
  await dl2;
  await expect(carte.getByTestId("etat-rappel")).toBeVisible();
  await carte.getByRole("button", { name: "Vider cet enclos" }).click();
  await carte.getByRole("button", { name: "Oui, vider" }).click();
  await expect(carte.getByTestId("rappel")).toHaveCount(0);
  await expect(carte.getByTestId("ancien-rappel")).toContainText(/Pense à supprimer l.ancien rappel de 21\sh\s28 dans ton agenda/);
  await saisir(page);
  await expect(boutonRappel(carte)).toBeVisible();
  await expect(carte.getByTestId("etat-rappel")).toHaveCount(0);
  await expect(carte.getByTestId("ancien-rappel")).toBeVisible(); // l'événement déjà créé reste à supprimer
});

/* #56 : le focus ne tombe jamais sur <body> après une action sur la saisie ; l'annonce vocale dit ce qui s'est passé. */
const annonceEnclos = (page: Page) => page.getByTestId("annonce-enclos");
const pasBody = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");

test("focus et annonces : ouvrir, enregistrer (carte re-triée), annuler, vider (#56)", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const c1 = page.getByRole("region", { name: "Enclos 1" });
  const c3 = page.getByRole("region", { name: "Enclos 3" });

  /* « Saisir cet enclos » : le focus va sur le premier champ */
  await c1.getByRole("button", { name: "Saisir cet enclos" }).click();
  await expect(page.getByLabel("Nom de l'enclos")).toBeFocused();
  /* « Annuler » : retour sur le bouton qui a ouvert le formulaire */
  await c1.getByRole("button", { name: "Annuler" }).click();
  await expect(c1.getByRole("button", { name: "Saisir cet enclos" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText("Saisie annulée.");

  /* enregistrer l'enclos 1 (-3000) */
  await c1.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(c1.getByRole("heading", { level: 2, name: "Enclos 1" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText(/^Enclos 1 enregistré : reviens avant 21\sh\s33\.$/);

  /* « Je quitte l'enclos » : premier champ, formulaire prérempli */
  await c1.getByRole("button", { name: "Je quitte l’enclos" }).click();
  await expect(page.getByLabel("Nom de l'enclos")).toBeFocused();
  await c1.getByRole("button", { name: "Annuler" }).click();
  await expect(c1.getByRole("button", { name: "Je quitte l’enclos" })).toBeFocused();

  /* l'enclos 3, plus urgent, remonte avant l'enclos 1 : le focus le suit (retrouvé par son id) */
  await c3.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("1000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("200000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Enclos 3");
  await expect(c3.getByRole("heading", { level: 2, name: "Enclos 3" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText(/^Enclos 3 enregistré : reviens avant 21\sh\s\d\d\.$/);

  /* « Vider » : « Garder » garde le comportement actuel ; « Oui, vider » → bouton « Saisir cet enclos » */
  await c3.getByRole("button", { name: "Vider cet enclos" }).click();
  await expect(c3.getByRole("button", { name: "Garder" })).toBeFocused();
  await c3.getByRole("button", { name: "Oui, vider" }).click();
  await expect(c3.getByRole("button", { name: "Saisir cet enclos" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText("Enclos 3 vidé.");
  await pasBody(page);
});

test("focus : enregistrer un enclos sans heure de retour annonce la raison (#56)", async ({ page }) => {
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-3000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(carte.getByRole("heading", { level: 2, name: "Enclos 1" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText("Enclos 1 enregistré : aucune jauge de sérénité active, pas d’heure de retour à prévoir.");
});

test("clavier seul : saisir, enregistrer, quitter, annuler (Échap), vider, sans toucher à la souris (#56)", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Nom de l'enclos")).toBeFocused();

  /* Échap ferme le formulaire et rend le focus au bouton d'origine */
  await page.keyboard.press("Escape");
  await expect(page.getByRole("form", { name: "Saisie de l'enclos" })).toHaveCount(0);
  await expect(carte.getByRole("button", { name: "Saisir cet enclos" })).toBeFocused();

  /* Entrée dans un champ enregistre : Tab jusqu'à la sérénité exacte, Entrée valide */
  await page.keyboard.press("Enter");
  await page.getByLabel("Sérénité exacte de la monture 1").focus();
  await page.keyboard.type("-3000");
  await page.getByRole("button", { name: "Sérénité +" }).focus();
  await page.keyboard.press("Enter");
  await page.getByPlaceholder("ex. 200000 ou 85k").focus();
  await page.keyboard.type("200000");
  await page.keyboard.press("Enter");
  await expect(carte.getByRole("heading", { level: 2, name: "Enclos 1" })).toBeFocused();
  await expect(annonceEnclos(page)).toContainText("Enclos 1 enregistré : reviens avant");

  /* Tab depuis l'en-tête atteint « Je quitte l'enclos » */
  await page.keyboard.press("Tab");
  await expect(carte.getByRole("button", { name: "Je quitte l’enclos" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Nom de l'enclos")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(carte.getByRole("button", { name: "Je quitte l’enclos" })).toBeFocused();

  /* vider au clavier */
  await carte.getByRole("button", { name: "Vider cet enclos" }).focus();
  await page.keyboard.press("Enter");
  await expect(carte.getByRole("button", { name: "Garder" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(carte.getByRole("button", { name: "Oui, vider" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(carte.getByRole("button", { name: "Saisir cet enclos" })).toBeFocused();
  await expect(annonceEnclos(page)).toHaveText("Enclos 1 vidé.");
});

test("focus du choix de rappel inchangé après une ressaisie (#51, #53, #56)", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisir(page);
  const carte = page.getByRole("region", { name: "Enclos 1" });
  const dl = page.waitForEvent("download");
  await programmerAvec(page, carte, /Dans mon agenda/);
  await dl;
  await expect(changer(carte)).toBeFocused();
  await ressaisir(page, carte, "-1000");
  await expect(carte.getByRole("heading", { level: 2, name: "Enclos 1" })).toBeFocused();
  /* la méthode est mémorisée : un appui au clavier programme, puis le focus passe à « changer » */
  const dl2 = page.waitForEvent("download");
  await boutonRappel(carte).focus();
  await page.keyboard.press("Enter");
  await dl2;
  await expect(changer(carte)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choix(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(changer(carte)).toBeFocused();
});

test("carte allégée (#57) : rouge seulement sous 30 min, sans jauge on ne parle plus d'« objectif »", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await saisir(page);
  /* retour à 21 h 33 : 33 min, pas urgent (carte et accueil) */
  await expect(carte).toHaveAttribute("data-urgent", "false");
  await expect(carte.getByText(/plus de points que nécessaire/)).not.toContainText(/\d{2}\sh\s\d{2}/);
  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  const ligne = page.getByRole("link", { name: /Enclos 1.*Reviens avant 21 h 33/ });
  await expect(ligne).toHaveAttribute("data-urgent", "false");

  /* 10 min plus tard : moins de 30 min, urgent */
  await page.clock.fastForward(10 * 60_000);
  await expect(ligne).toHaveAttribute("data-urgent", "true");
  await ligne.click();
  await expect(page.getByRole("region", { name: "Enclos 1" })).toHaveAttribute("data-urgent", "true");

  /* enclos sans jauge de sérénité : pas de « aucun objectif » */
  const carte2 = page.getByRole("region", { name: "Enclos 2" });
  await carte2.getByRole("button", { name: "Saisir cet enclos" }).click();
  await carte2.getByLabel("Sérénité exacte de la monture 1").fill("0");
  await carte2.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(carte2.getByText(/Aucune jauge de sérénité active/)).toHaveCount(1);
  await expect(carte2.getByText(/aucun objectif/i)).toHaveCount(0);
});
test("objectifs Endurance / Amour (#63) : proposé selon l'autre jauge, conseil dans la plage, alerte « ne monte plus »", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-4200");
  await page.getByRole("button", { name: /Ajouter une monture/ }).click();
  await page.getByLabel("Sérénité exacte de la monture 2").fill("-3800");
  await page.getByRole("button", { name: /Ajouter une monture/ }).click();
  await page.getByLabel("Sérénité exacte de la monture 3").fill("-3000");
  await page.getByRole("button", { name: "Sérénité −" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("60000");
  const objectifSaisie = page.getByRole("group", { name: "Objectif de sérénité" });
  await expect(objectifSaisie.getByRole("button", { name: /Éviter/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Autre jauge" }).getByRole("button", { name: "Endurance" }).click();
  await expect(objectifSaisie.getByRole("button", { name: "Rester en Endurance" })).toHaveAttribute("aria-pressed", "true");
  await page.getByPlaceholder("ex. 120k").fill("200k");
  await page.getByRole("button", { name: /Enregistrer/ }).click();

  /* le conseil garde les montures en sérénité négative (avant #63 : 8 800 points, toutes en positif) */
  await expect(carte.getByRole("button", { name: "Rester en Endurance" })).toHaveAttribute("aria-pressed", "true");
  await expect(
    carte.getByText(/À ton retour\s*: passe sur la jauge Sérénité \+ et mets 1\s900 points au total pour recentrer tes montures dans la zone Endurance/),
  ).toBeVisible();
  await expect(carte.getByTestId("alerte-jauge")).toHaveCount(0);

  /* ressaisie : objectif choisi à la main, puis jauge Amour : l'objectif choisi reste ; alerte, les montures sont négatives */
  await carte.getByRole("button", { name: "Je quitte l’enclos" }).click();
  await expect(objectifSaisie.getByRole("button", { name: "Rester en Endurance" })).toHaveAttribute("aria-pressed", "true");
  await objectifSaisie.getByRole("button", { name: /Éviter/ }).click();
  await page.getByRole("group", { name: "Autre jauge" }).getByRole("button", { name: "Amour" }).click();
  await expect(objectifSaisie.getByRole("button", { name: /Éviter/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(carte.getByRole("button", { name: /Éviter/ })).toHaveAttribute("aria-pressed", "true");
  await expect(carte.getByTestId("alerte-jauge")).toContainText(
    /l’Amour ne monte pour aucune de tes montures en ce moment\s*: leur sérénité est négative/,
  );
  await expect(carte.getByTestId("alerte-jauge")).not.toContainText(/carburant|gaspill/);
});

test("jauge Endurance en pause hors plage (#73) : plus de « vide à » quand aucune monture n'est en sérénité négative", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  const carte = page.getByRole("region", { name: "Enclos 1" });
  await carte.getByRole("button", { name: "Saisir cet enclos" }).click();
  /* −2 000 en Sérénité + (1 pt/s) : passe à −1 à 21 h 33, puis l'Endurance ne se vide plus */
  await page.getByLabel("Sérénité exacte de la monture 1").fill("-2000");
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill("60000");
  await page.getByRole("group", { name: "Autre jauge" }).getByRole("button", { name: "Endurance" }).click();
  await page.getByPlaceholder("ex. 120k").fill("90k");
  await page.getByRole("button", { name: /Enregistrer/ }).click();

  const ligne = carte.getByTestId("autre-jauge");
  await expect(ligne).toHaveText(/^Jauge Endurance en pause à partir de 21\sh\s33\s: plus aucune monture en sérénité négative\.$/);
  await expect(ligne).not.toContainText("vide à");

  await page.clock.fastForward(60 * 60_000);
  await expect(ligne).toHaveText(/^Jauge Endurance en pause depuis 21\sh\s33\s: aucune monture en sérénité négative\.$/);

  /* ressaisie : le niveau prérempli ne compte que les 1 999 s de consommation (90 000 − 3 998) */
  await carte.getByRole("button", { name: "Je quitte l’enclos" }).click();
  await expect(page.getByPlaceholder("ex. 120k")).toHaveValue("86002");
});

/* #65 : tournée = le plus urgent + les enclos dont le retour tombe dans les 15 min qui suivent */
async function saisirTournee(page: Page, nom: string, serenite: string, niveau = "200000") {
  await page.getByRole("region", { name: nom }).getByRole("button", { name: "Saisir cet enclos" }).click();
  await page.getByLabel("Sérénité exacte de la monture 1").fill(serenite);
  await page.getByRole("button", { name: "Sérénité +" }).click();
  await page.getByPlaceholder("ex. 200000 ou 85k").fill(niveau);
  await page.getByRole("button", { name: /Enregistrer/ }).click();
}

test("tournée (#65) : 21 h 25 / 21 h 33 / 21 h 33 / 21 h 41 → « 3 enclos », le 4e à part ; un clic, un seul .ics, état gardé au rechargement", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisirTournee(page, "Enclos 1", "-3000");
  await saisirTournee(page, "Enclos 2", "-3000");
  /* deux enclos seulement à 21 h 33 : déjà une tournée de 2 */
  await expect(page.getByTestId("tournee-resume")).toContainText(/Passe à 21\sh\s33\s: 2\senclos/);
  await saisirTournee(page, "Enclos 3", "-1000");
  await saisirTournee(page, "Enclos 4", "-5000");
  const tournee = page.getByTestId("tournee");
  await expect(page.getByTestId("tournee-resume")).toContainText(/Passe à 21\sh\s25\s: 3\senclos/);
  const liste = tournee.getByRole("list", { name: "Enclos de la tournée" });
  await expect(liste.getByRole("listitem")).toHaveText([/Enclos 3\s21\sh\s25/, /Enclos 1\s21\sh\s33/, /Enclos 2\s21\sh\s33/]);
  await expect(liste).not.toContainText("Enclos 4");

  let telechargements = 0;
  page.on("download", () => telechargements++);
  const dl = page.waitForEvent("download");
  await tournee.getByRole("button", { name: /^Me rappeler pour la tournée/ }).click();
  await choix(page).getByRole("radio", { name: /Dans mon agenda/ }).check();
  await choix(page).getByRole("button", { name: /^Me rappeler à/ }).click();
  const ics = fs.readFileSync((await (await dl).path())!, "utf8");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(ics.replace(/\r\n /g, "")).toMatch(/Enclos 3 : avant 21.{1,3}h.{1,3}25.*Enclos 1.*Enclos 2/);
  await expect(tournee.getByTestId("etat-rappel-tournee")).toContainText(/^✓ Rappel de la tournée programmé à 21\sh\s20\s\(dans ton agenda\)/);
  await expect(tournee.getByTestId("annonce-rappel-tournee")).toContainText("Rappel de la tournée programmé à 21");
  await expect(tournee.getByRole("button", { name: /^Me rappeler pour la tournée/ })).toHaveCount(0);
  expect(telechargements).toBe(1);
  /* les rappels par carte restent possibles */
  await expect(boutonRappel(page.getByRole("region", { name: "Enclos 1" }))).toBeVisible();

  /* rechargement : l'état survit, toujours un seul événement */
  await page.reload();
  await expect(page.getByTestId("etat-rappel-tournee")).toContainText(/Rappel de la tournée programmé à 21\sh\s20\s\(dans ton agenda\)/);
  await expect(page.getByRole("button", { name: /^Me rappeler pour la tournée/ })).toHaveCount(0);
  const stocke = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([k]) => k.includes("dd"))![1]).state.reglages.rappelTournee);
  expect(stocke).toMatchObject({ methode: "agenda" });
  expect(telechargements).toBe(1);

  /* un enclos ressaisi change la tournée : le rappel est obsolète, l'ancien événement est signalé */
  await ressaisir(page, page.getByRole("region", { name: "Enclos 3" }), "-4000");
  await expect(page.getByTestId("etat-rappel-tournee")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Me rappeler pour la tournée/ })).toBeVisible();
  await expect(page.getByTestId("ancien-rappel-tournee")).toContainText(/^Pense à supprimer l.ancien rappel de la tournée de 21\sh\s20 dans ton agenda/);
});

test("tournée (#65) : pas d'encadré avec un seul enclos ; lien depuis l'accueil quand il y en a plusieurs", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 21, 0, 0) });
  await page.goto("/enclos");
  await saisirTournee(page, "Enclos 1", "-3000");
  await expect(page.getByTestId("tournee")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByTestId("lien-tournee")).toHaveCount(0);
  await page.goto("/enclos");
  await saisirTournee(page, "Enclos 2", "-3000");
  await page.goto("/");
  await page.getByTestId("lien-tournee").click();
  await expect(page).toHaveURL(/\/enclos#titre-tournee/);
  await expect(page.getByTestId("tournee")).toBeVisible();
});

test("tournée (#65) : en démo, aucun rappel réel, même message que les cartes", async ({ page }) => {
  await page.goto("/enclos");
  await expect(page.getByRole("region", { name: "Enclos 1" })).toBeVisible();
  const avant = await etatLocal(page);
  await page.getByRole("button", { name: "Voir une démo" }).click();
  const tournee = page.getByTestId("tournee");
  await expect(tournee).toBeVisible();
  await tournee.getByRole("button", { name: /^Me rappeler pour la tournée/ }).click();
  await expect(tournee.getByTestId("annonce-rappel-tournee")).toContainText("Mode démo : aucun rappel réel n’est programmé");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tournee.getByTestId("etat-rappel-tournee")).toHaveCount(0);
  expect(await etatLocal(page)).toBe(avant);
});
