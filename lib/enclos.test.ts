import { describe, expect, it } from "vitest";
import {
  brouillonDe,
  enclosDeBrouillon,
  formatCompteARebours,
  formatDuree,
  formatHeure,
  parseNombre,
  remplacerEnclos,
  trierParUrgence,
  visageDe,
  VISAGES,
  vueEnclos,
} from "@/lib/enclos";
import { defaultEnclos, enclosSchema } from "@/lib/schema";

const T0 = new Date(2026, 10, 20, 21, 0, 0).getTime();

const enclosTest = (serenites: number[], niveau: number, sens: "+" | "-" | null = "+") =>
  enclosSchema.parse({
    nom: "Test",
    montures: serenites.map((serenite) => ({ serenite })),
    jaugeSerenite: sens,
    niveauSerenite: niveau,
    saisieLe: T0,
  });

describe("visages", () => {
  it("valeurs représentatives = milieu de chaque tranche", () => {
    expect(VISAGES.map((v) => v.valeur)).toEqual([-3500, -1000, 1000, 3500]);
  });
  it("chaque valeur retombe sur son propre visage", () => {
    for (const v of VISAGES) expect(visageDe(v.valeur).id).toBe(v.id);
    expect(visageDe(-5000).id).toBe("rouge");
    expect(visageDe(0).id).toBe("violet");
    expect(visageDe(5000).id).toBe("vert");
  });
});

describe("parseNombre", () => {
  it("accepte 85k, espaces, virgule, signe moins typographique", () => {
    expect(parseNombre("85k")).toBe(85000);
    expect(parseNombre("85 K")).toBe(85000);
    expect(parseNombre("1,5k")).toBe(1500);
    expect(parseNombre("200 000")).toBe(200000);
    expect(parseNombre("−3000")).toBe(-3000);
    expect(parseNombre("+2000")).toBe(2000);
  });
  it("refuse le reste", () => {
    expect(parseNombre("")).toBeNull();
    expect(parseNombre("abc")).toBeNull();
    expect(parseNombre("12k5")).toBeNull();
  });
});

describe("enclosDeBrouillon", () => {
  const base = { nom: " Mon enclos ", serenites: ["-3000", ""], sens: "+" as const, niveau: "200k", autre: null, niveauAutre: "" };
  it("convertit et horodate", () => {
    const r = enclosDeBrouillon(base, T0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enclos.nom).toBe("Mon enclos");
      expect(r.enclos.montures).toEqual([{ nom: "", serenite: -3000 }]);
      expect(r.enclos.niveauSerenite).toBe(200000);
      expect(r.enclos.saisieLe).toBe(T0);
    }
  });
  it("refuse les valeurs hors bornes ou illisibles", () => {
    expect(enclosDeBrouillon({ ...base, serenites: ["6000"] }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, serenites: ["x"] }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, niveau: "300k" }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, niveau: "" }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, serenites: [""] }, T0).ok).toBe(false);
  });
  it("brouillonDe refait le même enclos", () => {
    const r = enclosDeBrouillon(base, T0);
    if (!r.ok) throw new Error("attendu ok");
    const b = brouillonDe(r.enclos);
    expect(b.serenites).toEqual(["-3000"]);
    expect(b.niveau).toBe("200000");
  });
});

describe("vueEnclos", () => {
  it("une monture à -3 000, Sérénité + pleine : alerte +5 000 dans ~33 min", () => {
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0);
    expect(v.alerte).not.toBeNull();
    expect(v.alerte?.valeur).toBe(5000);
    expect(v.retour?.quandMs).toBe(T0 + 2000 * 1000);
    expect(v.alerte?.gaspille).toBe(192000);
  });
  it("pas d'alerte si la jauge se vide avant la borne", () => {
    const v = vueEnclos(enclosTest([0], 3000), 0, T0);
    expect(v.alerte).toBeNull();
    expect(v.retour?.evenement.type).toBe("jaugeVide");
  });
  it("sans jauge active : pas de retour", () => {
    expect(vueEnclos(enclosTest([0], 0, null), 0, T0).retour).toBeNull();
    expect(vueEnclos(defaultEnclos()[0], 0, T0).retour).toBeNull();
  });
  it("estime la sérénité maintenant", () => {
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0 + 600_000);
    expect(v.plan.etat.serenites[0]).toBe(-3000 + 600 * 4);
  });
  it("heure de vidage de l'autre jauge", () => {
    const e = enclosSchema.parse({ ...enclosTest([0], 1000), autreJauge: "Endurance", niveauAutre: 3600 });
    expect(vueEnclos(e, 0, T0).autreVideMs).toBe(T0 + 3600 * 1000);
  });
});

describe("trierParUrgence", () => {
  it("le plus proche d'abord, les sans-retour à la fin", () => {
    const r = (q: number) => ({ evenement: {} as never, quandMs: q });
    const vues = [
      { index: 0, retour: null },
      { index: 1, retour: r(500) },
      { index: 2, retour: r(100) },
      { index: 3, retour: null },
    ];
    expect(trierParUrgence(vues).map((v) => v.index)).toEqual([2, 1, 0, 3]);
  });
});

describe("remplacerEnclos", () => {
  it("remplace sans muter, ignore un indice invalide", () => {
    const l = defaultEnclos();
    const e = enclosTest([1], 1);
    const n = remplacerEnclos(l, 2, e);
    expect(n[2]).toBe(e);
    expect(l[2]).not.toBe(e);
    expect(remplacerEnclos(l, 9, e).includes(e)).toBe(false);
  });
});

describe("formats", () => {
  it("formatHeure", () => {
    expect(formatHeure(new Date(2026, 10, 20, 21, 40).getTime(), T0)).toBe("21 h 40");
    expect(formatHeure(new Date(2026, 10, 21, 9, 5).getTime(), T0)).toBe("demain 09 h 05");
  });
  it("formatDuree et compte à rebours", () => {
    expect(formatDuree(45)).toBe("45 s");
    expect(formatDuree(723)).toBe("12 min 03 s");
    expect(formatDuree(3900)).toBe("1 h 05 min");
    expect(formatCompteARebours(723)).toBe("12:03");
    expect(formatCompteARebours(3909)).toBe("1:05:09");
  });
});
