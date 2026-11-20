import { describe, expect, it } from "vitest";
import { compute, DEFAULT_CALC, type CalcSettings } from "./calc";
import { defaultAppData, type PricesState } from "./schema";
import { demoData, priceValues } from "./store";
import {
  intensite, libelleAge, manquants, matrice, patchCibleSimple, prixNecessaires, serieGraphique, texteSeuil, verdict,
} from "./rentabilite";

const vide = priceValues({}, "Imagiro");
const calc = (patch: Partial<CalcSettings> = {}): CalcSettings => ({ ...DEFAULT_CALC, ...patch });

describe("prixNecessaires (mode simple)", () => {
  it("réglages par défaut : cible, gén. inférieure (raté + parents), Optimakina, neurone", () => {
    const n = prixNecessaires(calc());
    expect(n.map((x) => x.key)).toEqual(["g5", "g4", "opti5", "neurone"]);
    expect(n.find((x) => x.key === "g4")?.roles).toEqual(["bébé raté (revente)", "achat du parent A", "achat du parent B"]);
  });

  it("cible 2 avec parents gén. 1 : seulement 3 prix (pas de neurone : la gén. 1 ne s'extrait pas)", () => {
    expect(prixNecessaires(calc(patchCibleSimple(2))).map((x) => x.key)).toEqual(["g2", "g1", "opti2"]);
  });

  it("prix forcés, parents capturés, sans Optimakina, revente des parents, Génétons", () => {
    const n = prixNecessaires(
      calc({ priceTarget: 1, priceFail: 1, origin: "capture", opti: false, parentsMode: "sell", countGenetons: true, genA: 4, genB: 1 }),
    );
    expect(n.map((x) => [x.type, x.key])).toEqual([
      ["reglage", "sterileSell"],
      ["prix", "genetons"],
    ]);
  });

  /* Garde-fou : mêmes prix que ceux que compute() déclare manquants (libellés sans le rôle entre
     parenthèses), et incomplet exactement quand il reste un manquant, quelle que soit la configuration. */
  it("cohérent avec compute().missing sur toutes les combinaisons", () => {
    const P = priceValues(demoData(0).prices, "Imagiro");
    const sansRole = (l: string) => l.replace(/ \(.*\)$/, "");
    for (const target of [2, 3, 6, 10])
      for (const genA of [1, target - 1])
        for (const genB of [1, target - 1])
          for (const opti of [true, false])
            for (const origin of ["hdv", "capture"] as const)
              for (const parentsMode of ["extract", "sell", "none"] as const)
                for (const countGenetons of [true, false]) {
                  const c = calc({ target, genA, genB, opti, origin, parentsMode, countGenetons, sterileSell: 0 });
                  const attendus = [...new Set(compute(c, vide).missing.map(sansRole))].sort();
                  expect(prixNecessaires(c).map((n) => n.label).sort()).toEqual(attendus);
                  expect(manquants(c, vide)).toHaveLength(attendus.length);
                  expect(manquants(c, P).length > 0).toBe(compute(c, P).incomplete);
                }
  });
});

describe("verdict", () => {
  const P = priceValues(demoData(0).prices, "Imagiro");
  it("incomplet : liste ce qui manque", () => {
    const v = verdict(compute(calc(), vide));
    expect(v.statut).toBe("incomplet");
    if (v.statut === "incomplet") expect(v.manque).toHaveLength(6); // détail de compute()
    const v2 = verdict(compute(calc(), vide), manquants(calc(), vide).map((n) => n.label));
    if (v2.statut === "incomplet") expect(v2.manque).toEqual(["Monture gén. 5", "Monture gén. 4", "Optimakina gén. 5", "Neurone"]);
  });

  it("Optimakina : une génération supérieure renseignée suffit (comme compute())", () => {
    const P = { ...vide, opti: vide.opti.map((_, g) => (g === 7 ? 100 : 0)) };
    expect(manquants(calc(), P).map((n) => n.key)).not.toContain("opti5");
  });
  it("rentable / pas rentable selon l'espérance", () => {
    expect(verdict(compute(calc({ priceTarget: 5_000_000 }), P)).statut).toBe("rentable");
    expect(verdict(compute(calc({ priceTarget: 1 }), P)).statut).toBe("pasRentable");
  });
  it("équilibre si l'espérance est quasi nulle", () => {
    const r = { ...compute(calc(), P), profitExpected: 10, cost: 100_000 };
    expect(verdict(r).statut).toBe("equilibre");
  });
  it("texte du seuil de rentabilité", () => {
    expect(texteSeuil(null)).toMatch(/jamais/);
    expect(texteSeuil(-0.2)).toMatch(/toujours/);
    expect(texteSeuil(1.3)).toMatch(/impossible/);
    expect(texteSeuil(0.421)).toBe("43 %");
  });
});

describe("patchCibleSimple", () => {
  it("parents de la génération inférieure, bornés à 2..10", () => {
    expect(patchCibleSimple(6)).toEqual({ target: 6, genA: 5, genB: 5 });
    expect(patchCibleSimple(6, "gen1")).toEqual({ target: 6, genA: 5, genB: 1 });
    expect(patchCibleSimple(1)).toEqual({ target: 2, genA: 1, genB: 1 });
    expect(patchCibleSimple(42)).toEqual({ target: 10, genA: 9, genB: 9 });
  });
});

describe("libelleAge", () => {
  it("aujourd'hui, hier, vieux au-delà de 7 jours", () => {
    expect(libelleAge(null)).toBeNull();
    expect(libelleAge(0)).toEqual({ texte: "aujourd'hui", vieux: false });
    expect(libelleAge(1)?.texte).toBe("hier");
    expect(libelleAge(7)).toEqual({ texte: "il y a 7 j", vieux: false });
    expect(libelleAge(8)?.vieux).toBe(true);
  });
});

describe("matrice serveurs × génération", () => {
  it("sans prix : toutes les cases incomplètes, aucune couleur", () => {
    const m = matrice({}, DEFAULT_CALC, "same", 0);
    expect(m.lignes).toHaveLength(7);
    expect(m.maxAbs).toBe(0);
    expect(m.lignes.every((l) => l.meilleur === null && l.cases.every((c) => c.r.incomplete))).toBe(true);
    expect(intensite(1000, m.maxAbs)).toBe(0);
  });

  it("démo : cases complètes, meilleur par serveur, ancienneté, mêmes résultats que compute()", () => {
    const d = demoData(0);
    const m = matrice(d.prices, DEFAULT_CALC, "same", 3 * 864e5);
    const l = m.lignes.find((x) => x.server === "Imagiro")!;
    expect(l.nbPrix).toBe(21);
    expect(l.age).toBe(3);
    expect(l.cases.map((c) => c.g)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(l.meilleur).toBe(Math.max(...l.cases.map((c) => c.r.profitExpected)));
    expect(m.maxAbs).toBeGreaterThan(0);
    expect(intensite(m.maxAbs, m.maxAbs)).toBeCloseTo(0.75);
    const serie = serieGraphique(d.prices, "Imagiro", DEFAULT_CALC, "same");
    expect(serie.map((s) => s.r.profitExpected)).toEqual(l.cases.map((c) => c.r.profitExpected));
  });

  it("une ligne sans prix ne fausse pas l'échelle des autres", () => {
    const prices: PricesState = { Imagiro: demoData(0).prices.Imagiro };
    const m = matrice(prices, DEFAULT_CALC, "gen1", 0);
    expect(m.lignes.find((x) => x.server === "Orukam")!.meilleur).toBeNull();
    expect(m.lignes.find((x) => x.server === "Imagiro")!.meilleur).not.toBeNull();
    expect(defaultAppData().matB).toBe("same");
  });
});
