/* Logique pure du panneau « Mes enclos » (#2) : visages, saisie, formats, urgence.
   Le calcul de sérénité lui-même reste dans lib/serenity.ts. */
import { CAPACITE_JAUGE } from "@/lib/data";
import { AUTRES_JAUGES, enclosSchema, NB_ENCLOS, type Enclos } from "@/lib/schema";
import {
  planEnclos,
  SERENITE_MAX,
  tempsVidage,
  ZONE_MATURITE,
  type PlanSerenite,
  type EtatEstime,
  type EvenementSerenite,
  type SensJauge,
  type ZoneSerenite,
} from "@/lib/serenity";

export const MAX_MONTURES = 10;
/** Marge de sécurité : on propose de revenir un peu AVANT l'événement. */
export const MARGE_RETOUR_S = 300;

/* ---------- visages ---------- */
/* Les guides donnent des PLAGES, pas une valeur par visage (docs/serenite.md) :
   Endurance < 0, Maturité -2 000…+2 000, Amour >= 0. Chaque visage = la tranche qu'il désigne,
   la valeur retenue est le MILIEU arrondi de cette tranche :
   rouge  (Endurance seule)        -5 000 … -2 001  -> -3 500
   bleu   (Endurance + Maturité)   -2 000 …     -1  -> -1 000
   violet (Maturité + Amour)            0 … +2 000  -> +1 000
   vert   (Amour seul)             +2 001 … +5 000  -> +3 500 */
export interface Visage {
  id: "rouge" | "bleu" | "violet" | "vert";
  texte: string;
  nom: string;
  effet: string;
  min: number;
  max: number;
  valeur: number;
}
export const VISAGES: readonly Visage[] = [
  { id: "rouge", texte: ":C", nom: "Rouge", effet: "Endurance", min: -SERENITE_MAX, max: -2001, valeur: -3500 },
  { id: "bleu", texte: ":(", nom: "Bleu", effet: "Endurance + Maturité", min: -2000, max: -1, valeur: -1000 },
  { id: "violet", texte: ":)", nom: "Violet", effet: "Maturité + Amour", min: 0, max: 2000, valeur: 1000 },
  { id: "vert", texte: ":D", nom: "Vert", effet: "Amour", min: 2001, max: SERENITE_MAX, valeur: 3500 },
];

export function visageDe(serenite: number): Visage {
  return VISAGES.find((v) => serenite >= v.min && serenite <= v.max) ?? VISAGES[serenite < 0 ? 0 : 3];
}

/* ---------- saisie ---------- */
/** « 85k », « 85 000 », « 1,5k », « −3000 » -> nombre entier ; null si illisible. */
export function parseNombre(texte: string): number | null {
  const t = texte
    .toLowerCase()
    .replace(/[\s  _]/g, "")
    .replace(/[−–]/g, "-")
    .replace(",", ".");
  const m = /^([+-]?\d+(?:\.\d+)?)(k?)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export type Objectif = "aucun" | "maturite";
export const ZONES: Record<Objectif, ZoneSerenite | undefined> = { aucun: undefined, maturite: ZONE_MATURITE };

export interface Brouillon {
  nom: string;
  /** Sérénité de chaque monture, telle que tapée (vide = ligne ignorée). */
  serenites: string[];
  sens: SensJauge | null;
  niveau: string;
  autre: (typeof AUTRES_JAUGES)[number] | null;
  niveauAutre: string;
}

/** Brouillon prérempli : avec `etat`, les valeurs ESTIMÉES maintenant (on repart de là en quittant l'enclos). */
export function brouillonDe(enclos: Enclos, etat?: EtatEstime): Brouillon {
  const serenites = etat ? etat.serenites : enclos.montures.map((m) => m.serenite);
  const niveau = etat ? etat.niveauJauge : enclos.niveauSerenite;
  return {
    nom: enclos.nom,
    serenites: serenites.length ? serenites.map((s) => String(Math.round(s))) : [""],
    sens: enclos.jaugeSerenite,
    niveau: enclos.jaugeSerenite ? String(Math.round(niveau)) : "",
    autre: enclos.autreJauge,
    niveauAutre: enclos.autreJauge ? String(enclos.niveauAutre) : "",
  };
}

export type ResultatBrouillon = { ok: true; enclos: Enclos } | { ok: false; erreurs: string[] };

export function enclosDeBrouillon(b: Brouillon, maintenantMs: number): ResultatBrouillon {
  const erreurs: string[] = [];
  const montures: { nom: string; serenite: number }[] = [];
  b.serenites.forEach((txt, i) => {
    if (!txt.trim()) return;
    const n = parseNombre(txt);
    if (n === null) erreurs.push(`Monture ${i + 1} : « ${txt.trim()} » n'est pas un nombre.`);
    else if (n < -SERENITE_MAX || n > SERENITE_MAX) erreurs.push(`Monture ${i + 1} : la sérénité va de −5 000 à +5 000.`);
    else montures.push({ nom: "", serenite: n });
  });
  if (!montures.length && !erreurs.length) erreurs.push("Indique la sérénité d'au moins une monture.");
  if (montures.length > MAX_MONTURES) erreurs.push(`Un enclos contient ${MAX_MONTURES} montures au plus.`);

  const niveau = (txt: string, quoi: string): number => {
    if (!txt.trim()) return 0;
    const n = parseNombre(txt);
    if (n === null || n < 0 || n > CAPACITE_JAUGE) {
      erreurs.push(`${quoi} : un niveau de 0 à ${CAPACITE_JAUGE.toLocaleString("fr-FR")} (ex. 85k).`);
      return 0;
    }
    return n;
  };
  if (b.sens && !b.niveau.trim()) erreurs.push("Jauge de sérénité : indique son niveau.");
  const niveauSerenite = b.sens ? niveau(b.niveau, "Jauge de sérénité") : 0;
  const niveauAutre = b.autre ? niveau(b.niveauAutre, `Jauge ${b.autre}`) : 0;
  if (erreurs.length) return { ok: false, erreurs };

  const r = enclosSchema.safeParse({
    nom: b.nom.trim().slice(0, 60),
    montures,
    jaugeSerenite: b.sens,
    niveauSerenite,
    autreJauge: b.autre,
    niveauAutre,
    saisieLe: maintenantMs,
  });
  return r.success ? { ok: true, enclos: r.data } : { ok: false, erreurs: ["Saisie invalide."] };
}

/** Remplace l'enclos d'indice `i` (liste inchangée si l'indice est hors limites). */
export function remplacerEnclos(liste: readonly Enclos[], i: number, e: Enclos): Enclos[] {
  if (!Number.isInteger(i) || i < 0 || i >= NB_ENCLOS || i >= liste.length) return [...liste];
  return liste.map((x, k) => (k === i ? e : x));
}

/* ---------- vue calculée d'un enclos ---------- */
export interface RetourEnclos {
  /** Premier événement à surveiller : sortie de zone, première borne ±5 000 ou jauge vide. */
  evenement: EvenementSerenite;
  /** Heure de l'événement (ms). */
  quandMs: number;
}

export interface VueEnclos {
  index: number;
  plan: PlanSerenite & { etat: EtatEstime };
  retour: RetourEnclos | null;
  /** Une monture atteindra ±5 000 avant que la jauge soit vide : des points seront gaspillés. */
  alerte: { monture: number; valeur: number; quandMs: number; gaspille: number } | null;
  /** Heure à laquelle l'autre jauge sera vide (ms), si renseignée. */
  autreVideMs: number | null;
}

const TYPES_RETOUR = new Set(["sortieZone", "premiereBorne", "jaugeVide"]);

export function vueEnclos(enclos: Enclos, index: number, maintenantMs: number, objectif: Objectif = "aucun"): VueEnclos {
  const plan = planEnclos(enclos, maintenantMs, { zone: ZONES[objectif] });
  const actif = enclos.saisieLe !== null && plan.etat.sens !== null;
  const ev = actif ? plan.evenements.find((e) => TYPES_RETOUR.has(e.type)) : undefined;
  const retour = ev ? { evenement: ev, quandMs: Math.round(maintenantMs + ev.temps * 1000) } : null;
  const borne = actif ? plan.evenements.find((e) => e.type === "premiereBorne") : undefined;
  const gaspille = borne && borne.monture !== null ? (plan.gaspillage[borne.monture] ?? 0) : 0;
  const alerte =
    borne && borne.monture !== null && borne.valeur !== null && gaspille > 0
      ? { monture: borne.monture, valeur: borne.valeur, quandMs: Math.round(maintenantMs + borne.temps * 1000), gaspille }
      : null;
  const autreVideMs =
    enclos.autreJauge && enclos.saisieLe !== null ? Math.round(enclos.saisieLe + tempsVidage(enclos.niveauAutre) * 1000) : null;
  return { index, plan, retour, alerte, autreVideMs };
}

/** Le plus urgent en haut ; sans retour à prévoir, à la fin (ordre d'origine conservé). */
export function trierParUrgence<T extends { index: number; retour: RetourEnclos | null }>(vues: readonly T[]): T[] {
  return [...vues].sort((a, b) => {
    const qa = a.retour?.quandMs ?? Infinity;
    const qb = b.retour?.quandMs ?? Infinity;
    return qa === qb ? a.index - b.index : qa < qb ? -1 : 1;
  });
}

/* ---------- formats ---------- */
const p2 = (n: number) => String(n).padStart(2, "0");

/** « 21 h 40 », « demain 09 h 05 », « sam. 22 nov. 09 h 05 » (heure locale). */
export function formatHeure(ms: number, maintenantMs: number): string {
  const d = new Date(ms);
  const h = `${p2(d.getHours())} h ${p2(d.getMinutes())}`;
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(d) - jour(new Date(maintenantMs))) / 86_400_000);
  if (ecart === 0) return h;
  if (ecart === 1) return `demain ${h}`;
  if (ecart === -1) return `hier ${h}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${h}`;
}

/** « 45 s », « 12 min 03 s », « 1 h 05 min », « 35 h 38 min ». */
export function formatDuree(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${p2(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${p2(Math.floor((s % 3600) / 60))} min`;
}

/** Compte à rebours court pour le titre d'onglet : « 12:03 » ou « 1:05:09 ». */
export function formatCompteARebours(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

export const formatNombre = (n: number): string =>
  Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ").replace("-", "−");
export const formatSerenite = (n: number): string => `${n > 0 ? "+" : ""}${formatNombre(n)}`;
