/* =====================================================================
   guide.ts — logique pure du Guide et du tableau de bord (#4)
   Recherche de couleur, outil de temps d'XP, bonus Almanax du mois.
   ===================================================================== */

import { ALMANAX, GENERATIONS } from "./data";

/* « Émeraude » → « emeraude » : la recherche ignore accents et majuscules. */
export const normaliser = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export interface GenerationTrouvee {
  gen: number;
  sauvage: boolean;
  couleurs: { nom: string; trouve: boolean }[];
  nbTrouves: number;
}

/* Toutes les générations, chaque couleur marquée si elle contient la recherche.
   Recherche vide : rien n'est marqué. */
export function chercherCouleur(q: string): { generations: GenerationTrouvee[]; total: number } {
  const n = normaliser(q);
  let total = 0;
  const generations = GENERATIONS.map((g) => {
    const couleurs = g.couleurs.map((nom) => ({ nom, trouve: n.length > 0 && normaliser(nom).includes(n) }));
    const nbTrouves = couleurs.filter((c) => c.trouve).length;
    total += nbTrouves;
    return { gen: g.gen, sauvage: "sauvage" in g && g.sauvage === true, couleurs, nbTrouves };
  });
  return { generations, total };
}

/* ---------- temps de montée en niveau d'une monture ---------- */
export const TRAJETS_XP = [
  { id: "1-100", label: "Niveau 1 → 100", xp: 172668 },
  { id: "100-200", label: "Niveau 100 → 200", xp: 694914 },
  { id: "1-200", label: "Niveau 1 → 200", xp: 867582 },
] as const;

/* Heures à régime constant : XP / (vitesse du tier × 2 si Sage). */
export function heuresXp(xp: number, tier: number, sage: boolean): number {
  const vitesse = Math.min(4, Math.max(1, Math.round(tier))) * (sage ? 2 : 1);
  return xp / vitesse / 3600;
}

/* ---------- Almanax ---------- */
export interface BonusAlmanax {
  mois: string;
  dieu: string;
  bonus: string;
  /* « à vérifier en 3.7 » ou « 1 source » dans la donnée : à afficher comme incertain */
  incertain: boolean;
}

/* « Novembre (Otoul) : +20 % … » → { mois, dieu, bonus } */
export function lireAlmanax(ligne: string): BonusAlmanax {
  const m = /^(\S+)\s*\(([^)]+)\)\s*:\s*(.+)$/.exec(ligne);
  const incertain = /à vérifier|1 source/i.test(ligne);
  if (!m) return { mois: "", dieu: "", bonus: ligne, incertain };
  return { mois: m[1], dieu: m[2], bonus: m[3], incertain };
}

/* Bonus du mois de `date` et du mois suivant (heure locale). */
export function almanaxDuMois(date: Date): { actuel: BonusAlmanax; suivant: BonusAlmanax } {
  const m = date.getMonth();
  return { actuel: lireAlmanax(ALMANAX[m]), suivant: lireAlmanax(ALMANAX[(m + 1) % 12]) };
}
