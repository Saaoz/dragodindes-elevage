import { describe, expect, it } from "vitest";
import { almanaxDuMois, chercherCouleur, heuresXp, lireAlmanax, normaliser, TRAJETS_XP } from "./guide";

describe("recherche de couleur", () => {
  it("ignore accents et majuscules", () => {
    expect(normaliser("  Émeraude ")).toBe("emeraude");
    const r = chercherCouleur("emeraude");
    expect(r.total).toBeGreaterThan(0);
    const g9 = r.generations.find((g) => g.gen === 9)!;
    expect(g9.couleurs.find((c) => c.nom === "Émeraude")?.trouve).toBe(true);
    expect(g9.couleurs.find((c) => c.nom === "Prune")?.trouve).toBe(false);
  });

  it("recherche vide : rien de marqué, toutes les générations listées", () => {
    const r = chercherCouleur("");
    expect(r.total).toBe(0);
    expect(r.generations).toHaveLength(10);
    expect(r.generations[0].sauvage).toBe(true);
    expect(r.generations[1].sauvage).toBe(false);
  });

  it("aucune correspondance", () => {
    expect(chercherCouleur("licorne").total).toBe(0);
  });
});

describe("temps d'XP", () => {
  it("niveau 1 → 200 en tier 4 : ≈ 60 h, ≈ 30 h avec Sage", () => {
    const xp = TRAJETS_XP.find((t) => t.id === "1-200")!.xp;
    expect(heuresXp(xp, 4, false)).toBeCloseTo(60.25, 1);
    expect(heuresXp(xp, 4, true)).toBeCloseTo(30.12, 1);
    expect(heuresXp(3600, 9, false)).toBe(0.25); // tier borné à 4
  });
});

describe("Almanax", () => {
  it("lit mois, dieu, bonus et incertitude", () => {
    expect(lireAlmanax("Mai (Loumi) : -15 % d'ingrédients")).toEqual({
      mois: "Mai", dieu: "Loumi", bonus: "-15 % d'ingrédients", incertain: false,
    });
    expect(lireAlmanax("Avril (Nunu) : jauges doublées (à vérifier en 3.7)").incertain).toBe(true);
  });
  it("mois courant et suivant (décembre → janvier)", () => {
    const nov = almanaxDuMois(new Date(2026, 10, 20));
    expect(nov.actuel.mois).toBe("Novembre");
    expect(nov.suivant.mois).toBe("Décembre");
    expect(almanaxDuMois(new Date(2026, 11, 31)).suivant.mois).toBe("Janvier");
  });
});
