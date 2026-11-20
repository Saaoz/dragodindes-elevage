/* =====================================================================
   rentabilite.ts — logique pure de l'écran Rentabilité (#4)
   Ne refait AUCUN calcul de profit : tout passe par compute() de lib/calc.ts.
   Ici : quels prix demander (mode simple), verdict, comparatif serveurs × génération.
   ===================================================================== */

import { clamp, compute, optimakinaPrice, scenario, type CalcSettings, type ComputeResult, type Prices } from "./calc";
import { SERVEURS } from "./data";
import type { AppData, PriceKey, PricesState, ServerId } from "./schema";
import { oldestAge, priceCount, priceValues } from "./store";

/* ---------- prix nécessaires au calcul en cours ---------- */
export interface Necessaire {
  /* « prix » : un prix HDV du serveur (clé du store) ; « reglage » : un montant des réglages du calcul */
  type: "prix" | "reglage";
  key: PriceKey | "sterileSell";
  label: string;
  /* à quoi sert ce prix dans le calcul (« bébé cible », « parents A et B »…) */
  roles: string[];
}

/* Même logique que compute() (lib/calc.ts) : la liste des montants dont le calcul a besoin,
   dans l'ordre où ils sont lus, sans doublon. Un montant forcé dans les réglages (prix du bébé cible
   ou raté) n'est pas demandé. Testé contre compute().missing dans rentabilite.test.ts. */
export function prixNecessaires(c: CalcSettings): Necessaire[] {
  const out: Necessaire[] = [];
  const add = (type: Necessaire["type"], key: Necessaire["key"], label: string, role: string) => {
    const deja = out.find((n) => n.key === key);
    if (deja) {
      if (!deja.roles.includes(role)) deja.roles.push(role);
    } else out.push({ type, key, label, roles: [role] });
  };
  const target = clamp(c.target, 2, 10),
    genA = clamp(c.genA, 1, 10),
    genB = clamp(c.genB, 1, 10);
  const failGen = Math.max(1, target - 1);
  if (!(c.priceTarget > 0)) add("prix", `g${target}` as PriceKey, `Monture gén. ${target}`, "bébé réussi (revente)");
  if (!(c.priceFail > 0)) add("prix", `g${failGen}` as PriceKey, `Monture gén. ${failGen}`, "bébé raté (revente)");
  if (c.origin === "hdv") {
    add("prix", `g${genA}` as PriceKey, `Monture gén. ${genA}`, "achat du parent A");
    add("prix", `g${genB}` as PriceKey, `Monture gén. ${genB}`, "achat du parent B");
  }
  if (c.opti) add("prix", `opti${target}` as PriceKey, `Optimakina gén. ${target}`, "Makina utilisée");
  if (c.parentsMode === "extract") {
    if (genA > 1 || genB > 1) add("prix", "neurone", "Neurone", "extraction des parents");
  } else if (c.parentsMode === "sell") {
    add("reglage", "sterileSell", "Revente d'un parent stérile", "revente des 2 parents");
  }
  if (c.countGenetons && target > Math.max(genA, genB)) add("prix", "genetons", "Valeur d'un Géténon", "Génétons gagnés");
  return out;
}

/* Montant utilisé par compute() pour un élément nécessaire (0 = manquant). L'Optimakina se rabat,
   comme dans compute(), sur la moins chère des générations supérieures renseignées. */
export function valeurNecessaire(n: Necessaire, c: CalcSettings, P: Prices): number {
  if (n.key === "sterileSell") return c.sterileSell > 0 ? c.sterileSell : 0;
  if (n.key === "neurone") return P.neurone;
  if (n.key === "genetons") return P.genetons;
  const opti = /^opti(\d+)$/.exec(n.key);
  if (opti) return optimakinaPrice(P, +opti[1]);
  return P.gen[+n.key.slice(1)] ?? 0;
}

/* Éléments nécessaires encore sans montant (un par prix, même s'il sert à plusieurs choses). */
export const manquants = (c: CalcSettings, P: Prices): Necessaire[] =>
  prixNecessaires(c).filter((n) => !(valeurNecessaire(n, c, P) > 0));

/* ---------- verdict du mode simple ---------- */
export type Verdict =
  | { statut: "incomplet"; manque: string[] }
  | { statut: "rentable" | "pasRentable" | "equilibre"; profit: number };

/* Sur l'espérance (profit moyen par couple sur beaucoup d'accouplements) ; ±0,5 % du coût = équilibre.
   `manque` : libellés à afficher si incomplet (par défaut, la liste détaillée de compute()). */
export function verdict(r: ComputeResult, manque: string[] = r.missing): Verdict {
  if (r.incomplete) return { statut: "incomplet", manque };
  const tolerance = Math.max(1, r.cost * 0.005);
  if (Math.abs(r.profitExpected) <= tolerance) return { statut: "equilibre", profit: r.profitExpected };
  return { statut: r.profitExpected > 0 ? "rentable" : "pasRentable", profit: r.profitExpected };
}

/* Texte de la chance minimale pour être rentable. */
export function texteSeuil(breakEvenP: number | null): string {
  if (breakEvenP === null) return "jamais rentable à ces prix";
  if (breakEvenP <= 0) return "toujours rentable, même en cas d'échec";
  if (breakEvenP > 1) return "impossible, même à 100 %";
  return `${Math.ceil(breakEvenP * 100)} %`;
}

/* Mode simple : choisir la cible règle les parents sur la génération juste en dessous
   (parent B : même génération, ou génération 1 si le comparatif est réglé ainsi). */
export function patchCibleSimple(target: number, matB: AppData["matB"] = "same"): Pick<CalcSettings, "target" | "genA" | "genB"> {
  const t = clamp(Math.round(target), 2, 10);
  return { target: t, genA: t - 1, genB: matB === "gen1" ? 1 : t - 1 };
}

/* ---------- ancienneté d'un prix ---------- */
export const SEUIL_VIEUX_JOURS = 7;
export function libelleAge(jours: number | null): { texte: string; vieux: boolean } | null {
  if (jours === null) return null;
  if (jours <= 0) return { texte: "aujourd'hui", vieux: false };
  if (jours === 1) return { texte: "hier", vieux: false };
  return { texte: `il y a ${jours} j`, vieux: jours > SEUIL_VIEUX_JOURS };
}

/* ---------- comparatif serveurs × génération cible (heatmap) ---------- */
export const GENS_CIBLES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface CaseMatrice {
  g: number;
  r: ComputeResult;
}
export interface LigneMatrice {
  server: ServerId;
  nbPrix: number;
  age: number | null;
  cases: CaseMatrice[];
  /* meilleur profit espéré calculable de la ligne, null si aucune case complète */
  meilleur: number | null;
}
export interface Matrice {
  lignes: LigneMatrice[];
  /* plus grand |profit espéré| des cases complètes : sert à l'intensité des couleurs */
  maxAbs: number;
}

export function matrice(prices: PricesState, calc: CalcSettings, matB: AppData["matB"], now = Date.now()): Matrice {
  let maxAbs = 0;
  const lignes = SERVEURS.map(({ id }) => {
    const P = priceValues(prices, id);
    const cases = GENS_CIBLES.map((g) => ({ g, r: compute(scenario(calc, g, matB), P) }));
    const completes = cases.filter((c) => !c.r.incomplete).map((c) => c.r.profitExpected);
    for (const v of completes) maxAbs = Math.max(maxAbs, Math.abs(v));
    return {
      server: id as ServerId,
      nbPrix: priceCount(prices, id),
      age: oldestAge(prices, id, now),
      cases,
      meilleur: completes.length ? Math.max(...completes) : null,
    };
  });
  return { lignes, maxAbs };
}

/* Intensité (0 à 1) de la couleur d'une case : 0,15 minimum pour rester visible. */
export const intensite = (v: number, maxAbs: number): number => (maxAbs > 0 ? 0.15 + 0.6 * (Math.abs(v) / maxAbs) : 0);

/* Résultats du graphique (serveur actif) : un scénario par génération cible. */
export const serieGraphique = (prices: PricesState, server: ServerId, calc: CalcSettings, matB: AppData["matB"]) =>
  GENS_CIBLES.map((g) => ({ g, r: compute(scenario(calc, g, matB), priceValues(prices, server)) }));
