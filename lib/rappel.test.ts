import { describe, expect, it } from "vitest";
import { LIBELLE_CHOIX, methodeAUtiliser, methodesDisponibles, phraseSansPush } from "./rappel";
import { METHODES_RAPPEL } from "./schema";

describe("methodesDisponibles (#51)", () => {
  it("tout est possible : téléphone d'abord, puis agenda, Google, page", () => {
    expect(methodesDisponibles({ push: "pret", notificationPage: true })).toEqual(["push", "agenda", "google", "page"]);
  });
  it("push non configuré : méthode absente, agenda et page restent", () => {
    expect(methodesDisponibles({ push: { indisponible: "serveur" }, notificationPage: true })).toEqual(["agenda", "google", "page"]);
  });
  it("iPhone sans appli installée (ni push ni Notification) : l'agenda seulement", () => {
    expect(methodesDisponibles({ push: { indisponible: "ios-installer" }, notificationPage: false })).toEqual(["agenda", "google"]);
  });
  it("vérification du push en cours : pas encore proposé", () => {
    expect(methodesDisponibles({ push: "chargement", notificationPage: true })).not.toContain("push");
  });
  it("notifications bloquées : ni push ni page, l'agenda marche toujours", () => {
    expect(methodesDisponibles({ push: { indisponible: "refuse" }, notificationPage: false })).toEqual(["agenda", "google"]);
  });
});

describe("methodeAUtiliser (#51)", () => {
  it("garde la méthode mémorisée si elle est disponible", () => {
    expect(methodeAUtiliser("agenda", ["push", "agenda"])).toBe("agenda");
  });
  it("rouvre le choix (null) si elle n'est plus disponible ou jamais choisie", () => {
    expect(methodeAUtiliser("push", ["agenda", "google"])).toBeNull();
    expect(methodeAUtiliser(null, ["agenda"])).toBeNull();
  });
});

describe("phraseSansPush (#51)", () => {
  it("iPhone : explique l'installation sur l'écran d'accueil", () => {
    expect(phraseSansPush({ indisponible: "ios-installer" })).toMatch(/écran d’accueil/);
  });
  it("rien à dire si le serveur n'est pas configuré, ni si le push est possible", () => {
    expect(phraseSansPush({ indisponible: "serveur" })).toBeNull();
    expect(phraseSansPush("pret")).toBeNull();
    expect(phraseSansPush("chargement")).toBeNull();
  });
  it("chaque autre raison a une phrase sans jargon", () => {
    for (const r of ["navigateur", "sw", "refuse", "hors-ligne"] as const) {
      const p = phraseSansPush({ indisponible: r });
      expect(p).toBeTruthy();
      expect(p).not.toMatch(/service worker|push/i);
    }
  });
});

it("chaque méthode a un libellé", () => {
  for (const m of METHODES_RAPPEL) expect(LIBELLE_CHOIX[m].titre.length).toBeGreaterThan(3);
});
