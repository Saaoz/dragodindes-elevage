import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ECRANS, TOUTES_FONCTIONNALITES } from "./carte";

const RACINE = path.resolve(__dirname, "..");
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), "utf8");

/* Routes réelles : un dossier de `app/` qui contient une `page.tsx` (+ la racine). */
function routes(): Set<string> {
  const trouvees = new Set<string>();
  const parcourir = (dossier: string, url: string) => {
    if (existsSync(path.join(dossier, "page.tsx"))) trouvees.add(url || "/");
    for (const nom of readdirSync(dossier)) {
      const chemin = path.join(dossier, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin, `${url}/${nom}`);
    }
  };
  parcourir(path.join(RACINE, "app"), "");
  return trouvees;
}

/* Fichiers .tsx d'un dossier, récursivement. */
function sources(dossier: string): string[] {
  return readdirSync(path.join(RACINE, dossier), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => lire(path.join(dossier, f)));
}

/* Ids de sections du guide, lus dans le code (`<Section id="…"`) : aucune liste à tenir à jour en double. */
const idsGuide = () => [...lire("components/guide/guide-page.tsx").matchAll(/<Section\s+id="([\w-]+)"/g)].map((m) => m[1]);
/* Onglets de Rentabilité (`{ id: "prix", label: … }`) : l'ancre sélectionne l'onglet. */
const idsOngletsRentabilite = () =>
  [...lire("components/rentabilite/rentabilite-page.tsx").matchAll(/\{ id: "([\w-]+)", label:/g)].map((m) => m[1]);

describe("carte du site : cibles", () => {
  const cibles = [
    ...ECRANS.map((e) => ({ id: e.id, href: e.href })),
    ...TOUTES_FONCTIONNALITES.map((f) => ({ id: f.id, href: f.href })),
  ];

  it("les identifiants sont uniques", () => {
    const ids = cibles.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque écran a des fonctionnalités et des textes", () => {
    for (const e of ECRANS) {
      expect(e.fonctionnalites.length).toBeGreaterThan(0);
      expect(e.explication.length).toBeGreaterThan(10);
    }
    for (const f of TOUTES_FONCTIONNALITES) {
      expect(f.titre).not.toBe("");
      expect(f.explication.length).toBeGreaterThan(10);
    }
  });

  it("chaque cible pointe vers une route existante", () => {
    const connues = routes();
    for (const { id, href } of cibles) {
      const route = href.split("#")[0];
      expect(connues.has(route), `${id} : route ${route} inconnue`).toBe(true);
    }
  });

  it("chaque ancre existe dans la page visée", () => {
    const guide = idsGuide();
    const onglets = idsOngletsRentabilite();
    expect(guide.length).toBeGreaterThan(5); // garde-fou : la lecture du guide ne doit pas renvoyer du vide
    expect(onglets).toEqual(expect.arrayContaining(["simuler", "prix", "comparer"]));
    const composants = sources("components").join("\n");
    for (const { id, href } of cibles) {
      const [route, ancre] = href.split("#");
      if (!ancre) continue;
      if (route === "/guide") expect(guide, `${id} : section #${ancre}`).toContain(ancre);
      else if (route === "/rentabilite") expect(onglets, `${id} : onglet #${ancre}`).toContain(ancre);
      else expect(composants, `${id} : ancre #${ancre}`).toContain(`id="${ancre}"`);
    }
  });

  it("le guide de la carte couvre les sections existantes (hors Capacités, ajoutée à part)", () => {
    const dansCarte = ECRANS.find((e) => e.id === "guide")!.fonctionnalites.map((f) => f.href.split("#")[1]);
    for (const id of idsGuide()) {
      if (id === "capacites") continue;
      expect(dansCarte, `section du guide absente de la carte : ${id}`).toContain(id);
    }
  });
});
