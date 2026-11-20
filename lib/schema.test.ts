import { describe, expect, it } from "vitest";
import { DEFAULT_CALC, type CalcSettings } from "./calc";
import {
  NB_ENCLOS, appDataSchema, calcSchema, defaultAppData, defaultCalc, enclosSchema, priceEntrySchema,
  toCalcSettings,
} from "./schema";

describe("schéma calc", () => {
  it("les défauts sont ceux de DEFAULT_CALC (3.7 : Optimakina +20, Takeza désactivé)", () => {
    expect(defaultCalc()).toEqual(DEFAULT_CALC);
    expect(defaultCalc().optiBonus).toBe(20);
    expect(defaultCalc().takeza).toBe(false);
  });

  it("est compatible avec CalcSettings (compilation + exécution)", () => {
    const c: CalcSettings = toCalcSettings(defaultCalc());
    expect(c.target).toBe(5);
  });

  it("accepte optiBonus 10 et 20, refuse le reste", () => {
    expect(calcSchema.parse({ optiBonus: 10 }).optiBonus).toBe(10);
    expect(calcSchema.safeParse({ optiBonus: 15 }).success).toBe(false);
  });

  it("refuse hors bornes, négatifs et NaN", () => {
    expect(calcSchema.safeParse({ target: 11 }).success).toBe(false);
    expect(calcSchema.safeParse({ fuel: -1 }).success).toBe(false);
    expect(calcSchema.safeParse({ fuel: NaN }).success).toBe(false);
    expect(calcSchema.safeParse({ lvlA: 0 }).success).toBe(false);
  });
});

describe("schéma prix", () => {
  it("n'accepte que des prix entiers strictement positifs, datés", () => {
    expect(priceEntrySchema.safeParse({ v: 100, t: 1 }).success).toBe(true);
    for (const v of [0, -5, NaN, Infinity, 1.5]) expect(priceEntrySchema.safeParse({ v, t: 1 }).success).toBe(false);
    expect(priceEntrySchema.safeParse({ v: 100 }).success).toBe(false);
  });
});

describe("schéma enclos", () => {
  it("l'état par défaut contient 6 enclos vides nommés", () => {
    const d = defaultAppData();
    expect(d.enclos).toHaveLength(NB_ENCLOS);
    expect(d.enclos[0]).toMatchObject({ nom: "Enclos 1", montures: [], jaugeSerenite: null, saisieLe: null });
  });

  it("accepte des montures avec sérénité individuelle et deux jauges", () => {
    const e = enclosSchema.parse({
      nom: "Mon enclos",
      montures: [{ serenite: -3000 }, { nom: "B", serenite: 5000 }],
      jaugeSerenite: "+", niveauSerenite: 200000, autreJauge: "Amour", niveauAutre: 1000, saisieLe: 1762972800000,
    });
    expect(e.montures[0].serenite).toBe(-3000);
  });

  it("refuse sérénité hors -5000..5000, jauge inconnue, niveau négatif", () => {
    expect(enclosSchema.safeParse({ montures: [{ serenite: 5001 }] }).success).toBe(false);
    expect(enclosSchema.safeParse({ jaugeSerenite: "x" }).success).toBe(false);
    expect(enclosSchema.safeParse({ niveauAutre: -1 }).success).toBe(false);
  });

  it("l'état refuse un nombre d'enclos différent de 6", () => {
    expect(appDataSchema.safeParse({ enclos: [] }).success).toBe(false);
  });
});
