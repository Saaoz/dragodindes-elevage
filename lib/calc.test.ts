import { describe, expect, it } from "vitest";
import { chanceCible, compute, DEFAULT_CALC, parseKamas, scenario, type CalcSettings, type Prices } from "./calc";

/* Portage de legacy/tests.js : mêmes 21 tests, mêmes valeurs attendues. */

const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(1e-6);

const P: Prices = {
  gen: [0, 20000, 40000, 90000, 160000, 300000, 520000, 800000, 1300000, 2400000, 4000000],
  neurone: 25000,
  optimakina: 150000,
  genetons: 3000,
};

const base: CalcSettings = {
  target: 5,
  genA: 4,
  genB: 4,
  lvlA: 100,
  lvlB: 100,
  opti: true,
  optiBonus: 10,
  takeza: false,
  repro: false,
  origin: "hdv",
  parentsMode: "extract",
  sterileSell: 0,
  fuel: 0,
  priceTarget: 0,
  priceFail: 0,
  countGenetons: true,
};

describe("parseKamas", () => {
  it("parse 1 200 000", () => expect(parseKamas("1 200 000")).toBe(1200000));
  it("parse 1.200.000", () => expect(parseKamas("1.200.000")).toBe(1200000));
  it("parse 250k", () => expect(parseKamas("250k")).toBe(250000));
  it("parse 1,5M", () => expect(parseKamas("1,5M")).toBe(1500000));
  it("parse 300000 kamas", () => expect(parseKamas("300000 kamas")).toBe(300000));
  it("parse texte", () => expect(parseKamas("abc")).toBeNull());
  it("parse négatif", () => expect(parseKamas("-5")).toBeNull());
  it("parse vide", () => expect(parseKamas("")).toBeNull());
});

describe("compute", () => {
  const r = compute(base, P);

  it("chance 70 %", () => near(r.p, 0.7));
  it("coût 470 000", () => near(r.cost, 470000));
  it("profit espéré 21 600", () => near(r.profitExpected, 21600));
  it("profit succès", () => near(r.profitSuccess, 300000 + 200000 + 16 * 3000 - 470000));
  it("profit échec", () => near(r.profitFail, 160000 + 200000 - 470000));
  it("complet", () => expect(r.incomplete).toBe(false));

  it("sans Génétons", () => {
    const r2 = compute({ ...base, countGenetons: false }, P);
    near(r2.profitExpected, 21600 - 0.7 * 16 * 3000);
  });

  // niveau 200 ×2 + Optimakina = 100 %
  it("100 % cap", () => near(chanceCible(200, 200, true, 10), 1));
  it("90 % sans Opti", () => near(chanceCible(200, 200, false, 10), 0.9));

  // Takeza : +20 % sur la génération cible, plafonné à 100 %
  it("niveau 100 ×2 + Takeza = 80 %", () => near(chanceCible(100, 100, false, 10, true), 0.8));
  it("niveau 100 ×2 + Takeza + Optimakina 10 % = 90 %", () => near(chanceCible(100, 100, true, 10, true), 0.9));
  it("niveau 200 ×2 + Takeza + Optimakina 20 % = 100 % (plafond)", () =>
    near(chanceCible(200, 200, true, 20, true), 1));
  it("Takeza absent par défaut", () => near(chanceCible(100, 100, false, 10), 0.6));
  it("compute avec Takeza augmente p", () => {
    near(compute({ ...base, takeza: true }, P).p, 0.9);
    expect(compute({ ...base, takeza: true }, P).profitExpected).toBeGreaterThan(r.profitExpected);
  });

  // réglages par défaut (v2 + Optimakina 3.7)
  it("DEFAULT_CALC : Optimakina +20 %, Takeza désactivé", () => {
    expect(DEFAULT_CALC.optiBonus).toBe(20);
    expect(DEFAULT_CALC.takeza).toBe(false);
    near(compute(DEFAULT_CALC, P).p, 0.8);
  });

  // prix manquants signalés, pas silencieusement mis à 0
  const rm = compute(base, { gen: Array(11).fill(0), neurone: 0, optimakina: 0, genetons: 0 });
  it("incomplet si aucun prix", () => expect(rm.incomplete).toBe(true));
  it("liste des manquants non vide", () => expect(rm.missing.length > 0).toBe(true));

  // seuil de rentabilité
  const be = compute(base, P).breakEvenP;
  it("breakEven entre 0 et 1", () => expect(be !== null && be > 0 && be < 1).toBe(true));

  const s = scenario(base, 7, "gen1");
  it("scénario gen1", () => expect([s.target, s.genA, s.genB]).toEqual([7, 6, 1]));
});
