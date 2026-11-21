/* =====================================================================
   calc.ts — logique de calcul PURE (aucun accès au DOM, aucun React)
   Portage de legacy/calc.js : mêmes formules, mêmes valeurs, aucune correction.
   ===================================================================== */

import { GENETONS, LIEU_VENTE_DEFAUT, tauxTaxe, type LieuVenteId } from "./data";

export { GENETONS };

/* Réglages du simulateur (voir defaultCalc dans legacy/store.js) */
export interface CalcSettings {
  target: number;
  genA: number;
  genB: number;
  lvlA: number;
  lvlB: number;
  opti: boolean;
  optiBonus: number;
  takeza: boolean;
  repro: boolean;
  origin: "hdv" | "capture";
  parentsMode: "extract" | "sell" | "none";
  sterileSell: number;
  fuel: number;
  priceTarget: number;
  priceFail: number;
  countGenetons: boolean;
  /* où les reventes sont mises en vente : fixe la taxe HDV (#66) */
  lieuVente: LieuVenteId;
}

/* Valeurs par défaut du simulateur, reprises de defaultCalc (legacy/store.js).
   Écarts assumés avec la v2 : optiBonus 20 (Optimakina +20 % en 3.7) et takeza false. */
export const DEFAULT_CALC: CalcSettings = {
  target: 5,
  genA: 4,
  genB: 4,
  lvlA: 100,
  lvlB: 100,
  opti: true,
  optiBonus: 20,
  takeza: false,
  repro: false,
  origin: "hdv",
  parentsMode: "extract",
  sterileSell: 0,
  fuel: 0,
  priceTarget: 0,
  priceFail: 0,
  countGenetons: false,
  lieuVente: LIEU_VENTE_DEFAUT,
};

/* Prix numériques : gen[g] = prix d'une monture de génération g (index 0 inutilisé) */
export interface Prices {
  gen: number[];
  neurone: number;
  /* opti[g] = prix de l'Optimakina de génération g (index 0 et 1 inutilisés) */
  opti: number[];
  genetons: number;
}

export interface ComputeResult {
  p: number;
  babies: number;
  priceT: number;
  priceF: number;
  costParents: number;
  costOpti: number;
  fuel: number;
  cost: number;
  recovery: number;
  /* taux de taxe HDV (0,02 = 2 %) et taxe payée selon l'issue (une seule mise en vente par objet) */
  taxeTaux: number;
  taxeSuccess: number;
  taxeFail: number;
  taxeExpected: number;
  genGain: number;
  genValue: number;
  profitSuccess: number;
  profitFail: number;
  profitExpected: number;
  breakEvenP: number | null;
  roi: number | null;
  missing: string[];
  incomplete: boolean;
}

export const clamp = (n: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, Number.isFinite(+n) ? +n : a));

const pos = (x: number): number => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);

/* ---------- parseKamas : "1 200 000", "250k", "1,5M", "1.200.000" → nombre ----------
   Renvoie null si illisible ou négatif (jamais de corruption silencieuse). */
export function parseKamas(input: number | string | null | undefined): number | null {
  if (typeof input === "number") return isFinite(input) && input >= 0 ? Math.round(input) : null;
  const s = String(input == null ? "" : input)
    .toLowerCase()
    .replace(/[\s  _']/g, "")
    .replace(/kamas?$/, "");
  if (!s) return null;
  // "1.200.000" ou "1,200,000" : séparateurs de milliers
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ""), 10);
  const m = s.match(/^(\d+(?:[.,]\d+)?)(kk|mk|m|k)?$/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  const mult = m[2] === "k" ? 1e3 : m[2] ? 1e6 : 1;
  return Math.round(num * mult);
}

/* ---------- formatage ---------- */
export const fmt = (n: number): string => Math.round(n).toLocaleString("fr-FR");

export function fmtShort(n: number): string {
  const a = Math.abs(n),
    sign = n < 0 ? "−" : "";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(".", ",").replace(/,?0+$/, "") + " M";
  if (a >= 1e3) return sign + Math.round(a / 1e3).toLocaleString("fr-FR") + " k";
  return sign + Math.round(a);
}

/* ---------- chance de génération cible ---------- */
export function chanceCible(
  lvlA: number,
  lvlB: number,
  opti: boolean,
  optiBonus: number,
  takeza = false,
): number {
  const p =
    0.3 +
    0.0015 * (clamp(lvlA, 1, 200) + clamp(lvlB, 1, 200)) +
    (opti ? optiBonus / 100 : 0) +
    (takeza ? 0.2 : 0);
  return Math.min(1, Math.max(0, p));
}

/* ---------- prix de l'Optimakina adaptée à une génération cible ----------
   Une Makina de génération >= cible convient (Dofus pour les Noobs) : on prend celle de la cible
   si elle est renseignée, sinon la moins chère parmi les générations supérieures renseignées.
   Renvoie 0 si aucune n'est renseignée. */
export function optimakinaPrice(P: Prices, target: number): number {
  const exact = pos(P.opti[target]);
  if (exact > 0) return exact;
  let best = 0;
  for (let g = target + 1; g <= 10; g++) {
    const v = pos(P.opti[g]);
    if (v > 0 && (best === 0 || v < best)) best = v;
  }
  return best;
}

/* ---------- compute : un couple, un accouplement ----------
   c = réglages du simulateur, P = prix numériques.
   Un prix manquant (absent ou 0) est listé dans `missing` : le résultat est alors INCOMPLET. */
export function compute(c: CalcSettings, P: Prices): ComputeResult {
  const missing: string[] = [];
  const need = (label: string, v: number): number => {
    if (!(v > 0)) missing.push(label);
    return pos(v);
  };

  const target = clamp(c.target, 2, 10),
    genA = clamp(c.genA, 1, 10),
    genB = clamp(c.genB, 1, 10);
  const babies = c.repro ? 2 : 1;
  const p = chanceCible(c.lvlA, c.lvlB, c.opti, c.optiBonus, c.takeza);

  const failGen = Math.max(1, target - 1);
  const priceT = c.priceTarget > 0 ? c.priceTarget : need("Monture gén. " + target + " (bébé cible)", P.gen[target]);
  const priceF = c.priceFail > 0 ? c.priceFail : need("Monture gén. " + failGen + " (bébé raté)", P.gen[failGen]);

  let costParents = 0;
  if (c.origin === "hdv") {
    costParents =
      need("Monture gén. " + genA + " (parent A)", P.gen[genA]) + need("Monture gén. " + genB + " (parent B)", P.gen[genB]);
  }
  const costOpti = c.opti ? need("Optimakina gén. " + target, optimakinaPrice(P, target)) : 0;
  const fuel = pos(c.fuel);
  const cost = costParents + fuel + costOpti;

  let recovery = 0;
  if (c.parentsMode === "extract") {
    const neurones = (genA > 1 ? genA : 0) + (genB > 1 ? genB : 0);
    if (neurones > 0) recovery = neurones * need("Neurone", P.neurone);
  } else if (c.parentsMode === "sell") {
    recovery = 2 * need("Revente d'un parent stérile", c.sterileSell);
  }

  // Génétons : seulement si l'option est cochée ET que le bébé dépasse les générations des parents
  const genGain =
    c.countGenetons && target > Math.max(genA, genB) ? (GENETONS[genA] || 0) + (GENETONS[genB] || 0) : 0;
  const genValue = genGain > 0 ? genGain * need("Valeur d'un Géténon", P.genetons) : 0;

  // Taxe HDV (#66) : payée à la mise en vente sur chaque recette comptée au prix HDV (bébés, parents revendus,
  // neurones, Génétons), une seule mise en vente par objet.
  const taxeTaux = tauxTaxe(c.lieuVente);
  const k = 1 - taxeTaux;
  const grossSuccess = babies * priceT + recovery + genValue;
  const grossFail = babies * priceF + recovery;
  const taxeSuccess = grossSuccess * taxeTaux;
  const taxeFail = grossFail * taxeTaux;
  const profitSuccess = grossSuccess - taxeSuccess - cost;
  const profitFail = grossFail - taxeFail - cost;
  const profitExpected = p * profitSuccess + (1 - p) * profitFail;

  // chance minimale pour que l'espérance soit >= 0
  const denom = k * (babies * (priceT - priceF) + genValue);
  const breakEvenP = denom > 0 ? (cost - k * (recovery + babies * priceF)) / denom : null;

  return {
    p,
    babies,
    priceT,
    priceF,
    costParents,
    costOpti,
    fuel,
    cost,
    recovery,
    taxeTaux,
    taxeSuccess,
    taxeFail,
    taxeExpected: p * taxeSuccess + (1 - p) * taxeFail,
    genGain,
    genValue,
    profitSuccess,
    profitFail,
    profitExpected,
    breakEvenP,
    roi: cost > 0 ? profitExpected / cost : null,
    missing: Array.from(new Set(missing)),
    incomplete: missing.length > 0,
  };
}

/* Scénario "montée vers la génération g" utilisé par la heatmap et le graphique :
   parent A = gén. g-1, parent B = même gén. (mode "same") ou gén. 1 ; achetés à l'HDV.
   Reprend les réglages du simulateur (niveaux, Optimakina, carburant, parents, Génétons). */
export function scenario(calc: CalcSettings, g: number, modeB: "same" | "gen1"): CalcSettings {
  return {
    ...calc,
    target: g,
    genA: g - 1,
    genB: modeB === "gen1" ? 1 : g - 1,
    origin: "hdv",
    priceTarget: 0,
    priceFail: 0,
  };
}
