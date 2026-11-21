/* Carte du code (#85, onglet « Pour les développeurs ») : données produites par `scripts/export-carte-code.mjs`
   à partir du graphe local du plugin Understand-Anything, positions déjà calculées. Ce module ne fait que les
   typer et en tirer les voisins de chaque fichier et la recherche : aucun calcul de disposition à l'usage. */
import donnees from "./carte-code.json";

export type TypeLien = "imports" | "tested_by" | "configures" | "documents" | "depends_on" | "related";

export type Couche = { id: string; nom: string; description: string; x: number; titre: string[] };
export type Groupe = { couche: number; nom: string; y: number; hauteur: number };
export type Fichier = {
  chemin: string;
  etiquette: string;
  couche: number;
  groupe: string | null;
  resume: string;
  x: number;
  y: number;
};

export type CarteCode = {
  version: number;
  commit: string;
  analyseLe: string;
  depot: string;
  largeur: number;
  hauteur: number;
  noeud: { largeur: number; hauteur: number };
  couches: Couche[];
  groupes: Groupe[];
  fichiers: Fichier[];
  /** [source, cible, type] : indices dans `fichiers`. `tested_by` va du code vers son test. */
  liens: [number, number, TypeLien][];
};

export const CARTE_CODE = donnees as CarteCode;

/** Relations d'un fichier, dans les deux sens, regroupées pour le panneau de détail. */
export type Relations = {
  importe: number[];
  importePar: number[];
  testePar: number[];
  teste: number[];
  autres: number[];
};

export function relations(carte: CarteCode, i: number): Relations {
  const r: Relations = { importe: [], importePar: [], testePar: [], teste: [], autres: [] };
  for (const [s, c, type] of carte.liens) {
    if (s !== i && c !== i) continue;
    const autre = s === i ? c : s;
    if (type === "imports") (s === i ? r.importe : r.importePar).push(autre);
    else if (type === "tested_by") (s === i ? r.testePar : r.teste).push(autre);
    else r.autres.push(autre);
  }
  /* Un test importe forcément ce qu'il teste : on ne le répète pas dans les imports. */
  const sauf = (liste: number[], deja: number[]) => liste.filter((j) => !deja.includes(j));
  r.importePar = sauf(r.importePar, r.testePar);
  r.importe = sauf(r.importe, r.teste);
  const parChemin = (a: number, b: number) => carte.fichiers[a].chemin.localeCompare(carte.fichiers[b].chemin);
  for (const liste of Object.values(r)) {
    const uniques = [...new Set(liste)].sort(parChemin);
    liste.splice(0, liste.length, ...uniques);
  }
  return r;
}

/** Minuscules sans accents : « Écran » et « ecran » se trouvent l'un l'autre. */
export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Indices des fichiers dont le chemin ou le résumé contient tous les mots de la recherche. */
export function chercher(carte: CarteCode, recherche: string): number[] {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const resultats: number[] = [];
  carte.fichiers.forEach((f, i) => {
    const texte = normaliser(`${f.chemin} ${f.resume}`);
    if (mots.every((m) => texte.includes(m))) resultats.push(i);
  });
  /* Les fichiers dont le chemin correspond passent devant ceux trouvés par leur résumé seulement. */
  const dansChemin = (i: number) => mots.every((m) => normaliser(carte.fichiers[i].chemin).includes(m));
  return resultats.sort((a, b) => Number(dansChemin(b)) - Number(dansChemin(a)));
}

export const lienGithub = (carte: CarteCode, chemin: string) => `${carte.depot}/blob/main/${chemin}`;
