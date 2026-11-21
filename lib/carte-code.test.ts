import { describe, expect, it } from "vitest";
import { CARTE_CODE as carte, chercher, lienGithub, normaliser, relations } from "./carte-code";

/* Le fichier est produit par scripts/export-carte-code.mjs : on vérifie qu'il est cohérent et que la disposition
   précalculée est lisible (rien ne se chevauche, tout tient dans le cadre). */
describe("carte du code : données exportées", () => {
  it("contient des fichiers, des couches et des liens", () => {
    expect(carte.version).toBe(1);
    expect(carte.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isNaN(Date.parse(carte.analyseLe))).toBe(false);
    expect(carte.fichiers.length).toBeGreaterThan(10);
    expect(carte.couches.length).toBeGreaterThan(1);
    expect(carte.liens.length).toBeGreaterThan(0);
  });

  it("chaque fichier a un chemin unique, une couche existante et un résumé", () => {
    const chemins = carte.fichiers.map((f) => f.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const f of carte.fichiers) {
      expect(carte.couches[f.couche], f.chemin).toBeDefined();
      expect(f.resume.length, f.chemin).toBeGreaterThan(10);
      expect(f.chemin).not.toMatch(/^\/|\\/);
    }
  });

  it("chaque lien relie deux fichiers distincts", () => {
    for (const [s, c] of carte.liens) {
      expect(carte.fichiers[s]).toBeDefined();
      expect(carte.fichiers[c]).toBeDefined();
      expect(s).not.toBe(c);
    }
  });

  it("aucun fichier ne se chevauche et tout tient dans le cadre", () => {
    const { largeur: l, hauteur: h } = carte.noeud;
    for (const f of carte.fichiers) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + l).toBeLessThanOrEqual(carte.largeur);
      expect(f.y + h).toBeLessThanOrEqual(carte.hauteur);
    }
    for (let i = 0; i < carte.fichiers.length; i++)
      for (let j = i + 1; j < carte.fichiers.length; j++) {
        const a = carte.fichiers[i];
        const b = carte.fichiers[j];
        const chevauche = Math.abs(a.x - b.x) < l && Math.abs(a.y - b.y) < h;
        expect(chevauche, `${a.chemin} / ${b.chemin}`).toBe(false);
      }
  });
});

describe("carte du code : relations et recherche", () => {
  const indice = (chemin: string) => carte.fichiers.findIndex((f) => f.chemin === chemin);

  it("donne les relations dans les deux sens", () => {
    for (let i = 0; i < carte.fichiers.length; i++) {
      for (const j of relations(carte, i).importe) expect(relations(carte, j).importePar).toContain(i);
      for (const j of relations(carte, i).testePar) expect(relations(carte, j).teste).toContain(i);
    }
  });

  it("relie la logique des enclos à son test, sans le répéter dans les imports", () => {
    const enclos = indice("lib/enclos.ts");
    const test = indice("lib/enclos.test.ts");
    expect(enclos).toBeGreaterThanOrEqual(0);
    expect(relations(carte, enclos).testePar).toContain(test);
    expect(relations(carte, enclos).importePar).not.toContain(test);
    expect(relations(carte, test).teste).toContain(enclos);
    expect(relations(carte, test).importe).not.toContain(enclos);
  });

  it("cherche sans tenir compte des accents ni de la casse, chemins d'abord", () => {
    expect(normaliser("  Écran Rentabilité ")).toBe("ecran rentabilite");
    const res = chercher(carte, "ENCLOS");
    expect(res.length).toBeGreaterThan(0);
    expect(carte.fichiers[res[0]].chemin).toContain("enclos");
    expect(chercher(carte, "   ")).toEqual([]);
    expect(chercher(carte, "zzz-introuvable")).toEqual([]);
  });

  it("pointe vers le fichier sur GitHub", () => {
    expect(lienGithub(carte, "lib/enclos.ts")).toBe("https://github.com/Saaoz/dragodindes-elevage/blob/main/lib/enclos.ts");
  });
});
