import { describe, expect, it } from "vitest";
import { CAPACITE_JAUGE, GENERATIONS, GENETONS, TIERS } from "./data";

describe("cohérence de data.ts", () => {
  it("TIERS est contigu, part de 0 et finit à CAPACITE_JAUGE", () => {
    expect(TIERS[0].min).toBe(0);
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].min).toBe(TIERS[i - 1].max + 1);
    }
    expect(TIERS[TIERS.length - 1].max).toBe(CAPACITE_JAUGE);
  });

  it("il y a 10 générations, numérotées de 1 à 10", () => {
    expect(GENERATIONS).toHaveLength(10);
    expect(GENERATIONS.map((g) => g.gen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("GENETONS couvre les générations 1 à 10", () => {
    expect(Object.keys(GENETONS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
