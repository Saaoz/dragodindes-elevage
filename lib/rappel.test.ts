import { describe, expect, it } from "vitest";
import { LIBELLE_CHOIX, methodeAUtiliser, methodesDisponibles } from "./rappel";
import { METHODES_RAPPEL } from "./schema";

describe("methodesDisponibles (#51)", () => {
  it("notifications possibles : agenda d'abord, puis Google, puis page", () => {
    expect(methodesDisponibles({ notificationPage: true })).toEqual(["agenda", "google", "page"]);
  });
  it("notifications bloquées ou absentes (iPhone sans appli installée) : l'agenda marche toujours", () => {
    expect(methodesDisponibles({ notificationPage: false })).toEqual(["agenda", "google"]);
  });
  it("le push a été retiré : jamais proposé", () => {
    expect(METHODES_RAPPEL).not.toContain("push");
  });
});

describe("methodeAUtiliser (#51)", () => {
  it("garde la méthode mémorisée si elle est disponible", () => {
    expect(methodeAUtiliser("agenda", ["agenda", "google"])).toBe("agenda");
  });
  it("rouvre le choix (null) si elle n'est plus disponible ou jamais choisie", () => {
    expect(methodeAUtiliser("page", ["agenda", "google"])).toBeNull();
    expect(methodeAUtiliser(null, ["agenda"])).toBeNull();
  });
});

it("chaque méthode a un libellé", () => {
  for (const m of METHODES_RAPPEL) expect(LIBELLE_CHOIX[m].titre.length).toBeGreaterThan(3);
});
