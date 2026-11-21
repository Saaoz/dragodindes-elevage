/* =====================================================================
   schema.ts — schémas Zod de l'état de l'appli (les types TS en sont déduits)
   CalcSettings reste défini dans lib/calc.ts (source de vérité du calcul) :
   la compatibilité est vérifiée à la compilation en bas de ce fichier.
   ===================================================================== */

import { z } from "zod";
import { DEFAULT_CALC, type CalcSettings } from "./calc";
import { CAPACITE_JAUGE, SERVEURS } from "./data";

export const SERVER_IDS = SERVEURS.map((s) => s.id);
export type ServerId = (typeof SERVEURS)[number]["id"];
/* Optimakina : une Makina par génération CIBLE (opti2 … opti10 ; la cible va de 2 à 10).
   L'ancien prix unique `optimakina` (v2 et v3) est migré vers toutes ces clés (voir lib/store.ts). */
export const PRICE_KEYS = [
  "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "neurone",
  "opti2", "opti3", "opti4", "opti5", "opti6", "opti7", "opti8", "opti9", "opti10", "genetons",
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

export const NB_ENCLOS = 6;

const serverId = z.enum(SERVEURS.map((s) => s.id) as [ServerId, ...ServerId[]]);
const intMin = (min: number) => z.number().int().min(min);

/* ---------- réglages du calcul ---------- */
export const calcSchema = z.object({
  target: z.number().int().min(2).max(10).default(DEFAULT_CALC.target),
  genA: z.number().int().min(1).max(10).default(DEFAULT_CALC.genA),
  genB: z.number().int().min(1).max(10).default(DEFAULT_CALC.genB),
  lvlA: z.number().int().min(1).max(200).default(DEFAULT_CALC.lvlA),
  lvlB: z.number().int().min(1).max(200).default(DEFAULT_CALC.lvlB),
  opti: z.boolean().default(DEFAULT_CALC.opti),
  /* 3.7 : +20 % ; 10 (3.5) reste accepté et est conservé tel quel (choix de l'utilisateur) */
  optiBonus: z.union([z.literal(10), z.literal(20)]).default(DEFAULT_CALC.optiBonus as 10 | 20),
  repro: z.boolean().default(DEFAULT_CALC.repro),
  origin: z.enum(["hdv", "capture"]).default(DEFAULT_CALC.origin),
  parentsMode: z.enum(["extract", "sell", "none"]).default(DEFAULT_CALC.parentsMode),
  sterileSell: intMin(0).default(DEFAULT_CALC.sterileSell),
  fuel: intMin(0).default(DEFAULT_CALC.fuel),
  priceTarget: intMin(0).default(DEFAULT_CALC.priceTarget),
  priceFail: intMin(0).default(DEFAULT_CALC.priceFail),
  countGenetons: z.boolean().default(DEFAULT_CALC.countGenetons),
  takeza: z.boolean().default(DEFAULT_CALC.takeza),
});
export type CalcState = z.infer<typeof calcSchema>;
export const defaultCalc = (): CalcState => calcSchema.parse({});

/* ---------- prix datés : { v: kamas (> 0), t: horodatage ms } ---------- */
export const priceEntrySchema = z.object({
  v: z.number().int().positive(),
  t: z.number().finite().nonnegative(),
});
export type PriceEntry = z.infer<typeof priceEntrySchema>;

const serverPricesSchema = z.object(
  Object.fromEntries(PRICE_KEYS.map((k) => [k, priceEntrySchema.optional()])) as Record<
    PriceKey,
    z.ZodOptional<typeof priceEntrySchema>
  >,
);
export type ServerPrices = z.infer<typeof serverPricesSchema>;

export const pricesSchema = z.object(
  Object.fromEntries(SERVER_IDS.map((id) => [id, serverPricesSchema.optional()])) as Record<
    ServerId,
    z.ZodOptional<typeof serverPricesSchema>
  >,
);
export type PricesState = z.infer<typeof pricesSchema>;

/* ---------- enclos (#2) : schéma seulement, pas d'UI ---------- */
export const AUTRES_JAUGES = ["Endurance", "Maturité", "Amour", "Expérience de monture"] as const;

/* Objectif de sérénité d'un enclos (#4 : enregistré avec l'enclos) :
   « aucun » = éviter ±5 000, « maturite » = rester entre −2 000 et +2 000. */
export const OBJECTIFS = ["aucun", "maturite"] as const;
export type Objectif = (typeof OBJECTIFS)[number];

/* Marge des rappels (agenda, notification) : prévenir N minutes AVANT l'heure de retour. */
export const MARGES_RAPPEL_MIN = [0, 5, 10, 15, 30] as const;
export const MARGE_RAPPEL_DEFAUT_MIN = 5;

export const monture = z.object({
  nom: z.string().max(60).default(""),
  /* sérénité propre à chaque monture : -5 000 à +5 000 */
  serenite: z.number().int().min(-5000).max(5000).default(0),
});

/* Rappel programmé pour la saisie actuelle d'un enclos (#53 agenda / Google Agenda) ; at = heure du rappel.
   « page » n'y figure pas : il disparaît vraiment au rechargement, on ne le persiste pas.
   (Le rappel push des versions 5 à 8 a été retiré : il est remis à null à la lecture.) */
export const METHODES_PERSISTEES = ["agenda", "google"] as const;
export const rappelSchema = z.object({
  methode: z.enum(METHODES_PERSISTEES),
  /* heure du rappel (ms) */
  at: z.number().finite().nonnegative(),
});
export type Rappel = z.infer<typeof rappelSchema>;

/* Événement d'agenda laissé par une saisie précédente : l'appli ne peut pas le retirer, elle le rappelle au joueur. */
export const ancienRappelSchema = z.object({
  methode: z.enum(["agenda", "google"]),
  at: z.number().finite().nonnegative(),
});
export type AncienRappel = z.infer<typeof ancienRappelSchema>;

export const enclosSchema = z.object({
  nom: z.string().max(60).default(""),
  montures: z.array(monture).max(50).default([]),
  /* Sérénité + et − sont liées : une seule est active à la fois */
  jaugeSerenite: z.enum(["+", "-"]).nullable().default(null),
  niveauSerenite: z.number().int().min(0).max(CAPACITE_JAUGE).default(0),
  autreJauge: z.enum(AUTRES_JAUGES).nullable().default(null),
  niveauAutre: z.number().int().min(0).max(CAPACITE_JAUGE).default(0),
  /* horodatage de la saisie des niveaux (ms), null si jamais saisi */
  saisieLe: z.number().finite().nonnegative().nullable().default(null),
  /* Rappel programmé sur CET appareil pour la saisie actuelle (agenda, Google Agenda) ; remis à null
     à chaque ressaisie. Propre à l'appareil : jamais exporté, remis à null à l'import. */
  /* illisible (dont un ancien rappel push) : null, sans jamais faire perdre l'enclos */
  rappel: rappelSchema.nullable().catch(null),
  /* Dernier événement d'agenda / Google laissé par la saisie précédente (à supprimer à la main). Propre à l'appareil. */
  ancienRappel: ancienRappelSchema.nullable().catch(null),
  /* Objectif choisi pour cet enclos ; absent (anciennes données) ou illisible : « aucun »,
     sans jamais faire perdre l'enclos. */
  objectif: z.enum(OBJECTIFS).catch("aucun"),
});
export type Enclos = z.infer<typeof enclosSchema>;

export const defaultEnclos = (): Enclos[] =>
  Array.from({ length: NB_ENCLOS }, (_, i) => enclosSchema.parse({ nom: `Enclos ${i + 1}` }));

/* ---------- réglages de l'appli (#4) ---------- */
/* Façon de se faire rappeler (#51), mémorisée une fois choisie : fichier d'agenda (.ics), Google Agenda,
   ou notification dans la page tant qu'elle reste ouverte. */
export const METHODES_RAPPEL = ["agenda", "google", "page"] as const;
export type MethodeRappel = (typeof METHODES_RAPPEL)[number];

export const reglagesSchema = z.object({
  /* minutes de marge des rappels ; une valeur hors liste (ancienne / corrompue) retombe sur 5 */
  margeRappelMin: z
    .number()
    .int()
    .refine((n) => (MARGES_RAPPEL_MIN as readonly number[]).includes(n))
    .catch(MARGE_RAPPEL_DEFAUT_MIN),
  /* méthode de rappel mémorisée ; absente ou illisible : null (le choix est reproposé) */
  methodeRappel: z.enum(METHODES_RAPPEL).nullable().catch(null),
});
export type Reglages = z.infer<typeof reglagesSchema>;

/* ---------- état complet persisté / exporté ---------- */
export const appDataSchema = z.object({
  server: serverId.default(SERVER_IDS[0]),
  theme: z.enum(["dark", "light"]).default("dark"),
  matB: z.enum(["same", "gen1"]).default("same"),
  calc: calcSchema.prefault({}),
  prices: pricesSchema.prefault({}),
  enclos: z.array(enclosSchema).length(NB_ENCLOS).prefault(defaultEnclos()),
  reglages: reglagesSchema.prefault({ margeRappelMin: MARGE_RAPPEL_DEFAUT_MIN, methodeRappel: null }),
});
export type AppData = z.infer<typeof appDataSchema>;
export const defaultAppData = (): AppData => appDataSchema.parse({});

/* ---------- enveloppe d'export JSON ---------- */
export const APP_ID = "dd-elevage";
export const EXPORT_SCHEMA_VERSION = 4; // 4 : Optimakina par génération (opti2..opti10) au lieu d'un prix unique

/* ---------- compatibilité avec CalcSettings (lib/calc.ts), vérifiée à la compilation ----------
   Le schéma produit un CalcSettings valide (optiBonus 10|20 est plus étroit que number : sens unique)
   et porte exactement les mêmes clés (un champ ajouté d'un seul côté casse la compilation). */
type KeysEq<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false;
export const calcSchemaMatchesCalcSettings: KeysEq<CalcState, CalcSettings> = true;
export const toCalcSettings = (c: CalcState): CalcSettings => c;
