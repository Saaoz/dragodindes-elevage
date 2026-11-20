/* Logique pure du panneau « Mes enclos » (#2) : visages, saisie, formats, urgence.
   Le calcul de sérénité lui-même reste dans lib/serenity.ts. */
import { CAPACITE_JAUGE } from "@/lib/data";
import {
  AUTRES_JAUGES,
  enclosSchema,
  MARGE_RAPPEL_DEFAUT_MIN,
  NB_ENCLOS,
  type Enclos,
  type Objectif,
} from "@/lib/schema";
import {
  planEnclos,
  serenityPlan,
  pointsConsommes,
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
/** Marge de sécurité par défaut : on prévient un peu AVANT l'événement (réglable, voir `reglages`). */
export const MARGE_RETOUR_S = MARGE_RAPPEL_DEFAUT_MIN * 60;

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

export type { Objectif };
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
  /* L'autre jauge se vide aussi depuis la saisie : avec un état estimé, on repart de son niveau estimé
     (etat.tempsEcoule = (maintenant − saisieLe) / 1000). */
  const niveauAutre = etat
    ? Math.max(0, enclos.niveauAutre - pointsConsommes(enclos.niveauAutre, etat.tempsEcoule))
    : enclos.niveauAutre;
  return {
    nom: enclos.nom,
    serenites: serenites.length ? serenites.map((s) => String(Math.round(s))) : [""],
    sens: enclos.jaugeSerenite,
    niveau: enclos.jaugeSerenite ? String(Math.round(niveau)) : "",
    autre: enclos.autreJauge,
    niveauAutre: enclos.autreJauge ? String(Math.round(niveauAutre)) : "",
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
  /** Heure de l'événement (ms), calculée depuis la SAISIE : elle reste juste une fois passée (#31). */
  quandMs: number;
}

/** Une monture atteint ±5 000 avant que la jauge soit vide : des points sont (ou seront) gaspillés. */
export interface AlerteEnclos {
  monture: number;
  valeur: number;
  /** Heure (ms) à laquelle la monture atteint (ou a atteint) ±5 000, depuis la saisie. */
  quandMs: number;
  /** Points de jauge gaspillés pour elle au total, de la borne jusqu'à la jauge vide. */
  gaspille: number;
  /** La borne est déjà atteinte (heure passée). */
  passee: boolean;
  /** Points déjà gaspillés pour elle à l'instant considéré (0 avant la borne, au plus `gaspille`). */
  gaspilleDeja: number;
}

export interface VueEnclos {
  index: number;
  /** Plan à partir de l'état ESTIMÉ maintenant (sérénités, niveau, conseil de remplissage). */
  plan: PlanSerenite & { etat: EtatEstime };
  retour: RetourEnclos | null;
  alerte: AlerteEnclos | null;
  /** Retour dépassé : secondes écoulées depuis l'heure de retour (0 pile à l'heure) ; null avant (#31). */
  retardS: number | null;
  /** Conseil de remplissage affiché sur la carte, calculé sur l'état À L'HEURE DE RETOUR (stable, #33) ;
      null si le retour est dépassé (voir `CONSEIL_RETARD`). */
  conseil: string | null;
  /** Heure (ms) à laquelle la jauge de sérénité est (ou sera) vide, depuis la saisie ; null sans jauge. */
  jaugeVideMs: number | null;
  /** Heure à laquelle l'autre jauge sera vide (ms), si renseignée. */
  autreVideMs: number | null;
}

const TYPES_RETOUR = new Set(["sortieZone", "premiereBorne", "jaugeVide"]);

export function vueEnclos(
  enclos: Enclos,
  index: number,
  maintenantMs: number,
  objectif: Objectif = enclos.objectif ?? "aucun",
): VueEnclos {
  const options = { zone: ZONES[objectif] };
  const plan = planEnclos(enclos, maintenantMs, options);
  const saisieLe = enclos.saisieLe;
  /* Les événements sont datés depuis l'état SAISI, pas depuis l'état estimé maintenant : sinon un
     événement déjà passé serait toujours daté de « maintenant » (« depuis 0 s »), ou disparaîtrait
     (jauge vidée). Avant l'heure, les deux calculs donnent les mêmes heures (#31). */
  const depuisSaisie = saisieLe !== null && enclos.jaugeSerenite !== null ? planEnclos(enclos, saisieLe, options) : null;
  const heure = (temps: number) => Math.round((saisieLe ?? maintenantMs) + temps * 1000);

  const ev = depuisSaisie?.evenements.find((e) => TYPES_RETOUR.has(e.type));
  const retour = ev ? { evenement: ev, quandMs: heure(ev.temps) } : null;
  const retardS = retour && maintenantMs >= retour.quandMs ? (maintenantMs - retour.quandMs) / 1000 : null;

  const borne = depuisSaisie?.evenements.find((e) => e.type === "premiereBorne");
  const gaspille = borne && borne.monture !== null ? (depuisSaisie?.gaspillage[borne.monture] ?? 0) : 0;
  let alerte: AlerteEnclos | null = null;
  if (borne && borne.monture !== null && borne.valeur !== null && gaspille > 0) {
    const quandMs = heure(borne.temps);
    alerte = {
      monture: borne.monture,
      valeur: borne.valeur,
      quandMs,
      gaspille,
      passee: maintenantMs >= quandMs,
      gaspilleDeja: Math.min(gaspille, Math.max(0, Math.round(plan.etat.pointsConsommes - borne.points))),
    };
  }

  const jaugeVideMs = depuisSaisie && depuisSaisie.tempsVide > 0 ? heure(depuisSaisie.tempsVide) : null;
  const autreVideMs =
    enclos.autreJauge && saisieLe !== null ? Math.round(saisieLe + tempsVidage(enclos.niveauAutre) * 1000) : null;

  /* Conseil de remplissage (#33) : il ne sert qu'une fois sur place, donc il est calculé à l'heure de retour
     (il ne change plus chaque seconde) et ne dit jamais « pas besoin de revenir » à côté d'une heure de retour. */
  let conseil: string | null = null;
  if (retardS === null) {
    if (!retour) conseil = plan.aRemplir.conseil;
    else {
      /* À l'heure de retour la jauge est à remplacer : on part de ses sérénités estimées et d'une jauge vide. */
      const etatRetour = planEnclos(enclos, retour.quandMs, options).etat;
      const auRetour = serenityPlan({ serenites: etatRetour.serenites, sens: null, niveauJauge: 0, zone: options.zone }).aRemplir;
      const sansConseil = auRetour.statut === "dejaAtteint" && !options.zone;
      const c = sansConseil ? "" : auRetour.conseil.replace(/ : pas besoin de revenir avant qu.elle soit vide\.$/, ".");
      conseil = c ? `À ton retour : ${c.charAt(0).toLowerCase()}${c.slice(1)}` : "";
      if (depuisSaisie && depuisSaisie.aRemplir.excedent > 0)
        conseil += `${conseil ? " " : ""}La jauge contient plus de points que nécessaire : reviens avant ${formatHeure(retour.quandMs, maintenantMs)} pour changer de jauge (à vérifier en jeu : peut-on retirer le carburant ?).`;
    }
  }
  return { index, plan, retour, alerte, retardS, conseil: conseil || null, jaugeVideMs, autreVideMs };
}

/* ---------- retour dépassé (#31) ---------- */
const nomJauge = (sens: SensJauge | null) => `Sérénité ${sens === "-" ? "−" : "+"}`;

/** Pourquoi l'heure de retour compte, une seule formulation pour l'accueil, la carte et le rappel.
    Avant l'heure : « une monture sort de la zone Maturité ». Après : ce qui s'est passé, au passé et avec la vraie heure.
    null s'il n'y a pas d'heure de retour. */
export function raisonRetour(vue: VueEnclos, maintenantMs: number): string | null {
  if (!vue.retour) return null;
  const { evenement: ev, quandMs } = vue.retour;
  const m = (ev.monture ?? 0) + 1;
  if (vue.retardS === null) {
    switch (ev.type) {
      case "sortieZone":
        return "une monture sort de la zone Maturité";
      case "premiereBorne":
        return "une monture atteint ±5 000";
      default:
        return "la jauge de sérénité sera vide à ce moment-là";
    }
  }
  const h = formatHeure(quandMs, maintenantMs);
  switch (ev.type) {
    case "premiereBorne": {
      const deja = vue.alerte?.gaspilleDeja ?? 0;
      return `la monture ${m} est à ${formatSerenite(ev.valeur ?? 0)} depuis ${h}${deja > 0 ? `, ${formatNombre(deja)} points de jauge gaspillés` : ""}`;
    }
    case "sortieZone":
      return `la monture ${m} est sortie de la zone Maturité à ${h}`;
    default:
      return `jauge ${nomJauge(vue.plan.etat.sens)} vide depuis ${h}`;
  }
}

/** Quoi faire quand l'heure de retour est passée : il n'y a plus de rappel à prévoir, il faut ressaisir. */
export const CONSEIL_RETARD =
  "Retourne à l’enclos, regarde la sérénité des montures et le niveau des jauges, puis clique « Je quitte l’enclos » : une nouvelle heure de retour sera calculée.";

/** Texte de l'alerte ±5 000 : au futur avant la borne, au passé (avec les points déjà gaspillés) après. */
export function texteAlerte(alerte: AlerteEnclos, maintenantMs: number): string {
  const h = formatHeure(alerte.quandMs, maintenantMs);
  const qui = `la monture ${alerte.monture + 1}`;
  if (!alerte.passee)
    return `${qui} atteindra ${formatSerenite(alerte.valeur)} à ${h}. Si tu reviens plus tard, ${formatNombre(alerte.gaspille)} points de jauge sont gaspillés pour elle.`;
  const reste = alerte.gaspille - alerte.gaspilleDeja;
  return `${qui} a atteint ${formatSerenite(alerte.valeur)} à ${h} : ${formatNombre(alerte.gaspilleDeja)} points de jauge gaspillés pour elle${
    reste > 0 ? ` depuis, jusqu’à ${formatNombre(alerte.gaspille)} si tu ne reviens pas` : ""
  }.`;
}

/** Le plus urgent en haut ; sans retour à prévoir, à la fin (ordre d'origine conservé). */
export function trierParUrgence<T extends { index: number; retour: RetourEnclos | null }>(vues: readonly T[]): T[] {
  return [...vues].sort((a, b) => {
    const qa = a.retour?.quandMs ?? Infinity;
    const qb = b.retour?.quandMs ?? Infinity;
    return qa === qb ? a.index - b.index : qa < qb ? -1 : 1;
  });
}

/** Heure du rappel (agenda, notification) : `marge` minutes avant le retour, jamais dans le passé. */
export function heureRappel(retourMs: number, margeMin: number, maintenantMs: number): number {
  return Math.max(retourMs - Math.max(0, margeMin) * 60_000, maintenantMs);
}

/** « 5 min avant », « à l'heure exacte ». */
export const libelleMarge = (margeMin: number): string =>
  margeMin <= 0 ? "à l’heure exacte" : `${margeMin}${ESPACE_INSECABLE}min avant`;

/** Le plus urgent d'abord, limité aux enclos saisis qui ont une heure de retour (tableau de bord).
    Un enclos en retard garde son heure de retour passée : il reste donc en tête (#31). */
export function enclosUrgents(liste: readonly Enclos[], maintenantMs: number, max = 3): VueEnclos[] {
  return trierParUrgence(liste.map((e, i) => vueEnclos(e, i, maintenantMs)))
    .filter((v) => v.retour !== null)
    .slice(0, max);
}

/* ---------- formats ---------- */
/** Espace insécable : durées, heures et nombres ne se coupent jamais en fin de ligne (#32). */
export const ESPACE_INSECABLE = " ";
const p2 = (n: number) => String(n).padStart(2, "0");

/** « 21 h 40 », « demain 09 h 05 », « sam. 22 nov. 09 h 05 » (heure locale). */
export function formatHeure(ms: number, maintenantMs: number): string {
  const d = new Date(ms);
  const h = `${p2(d.getHours())}${ESPACE_INSECABLE}h${ESPACE_INSECABLE}${p2(d.getMinutes())}`;
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
  const E = ESPACE_INSECABLE;
  if (s < 60) return `${s}${E}s`;
  if (s < 3600) return `${Math.floor(s / 60)}${E}min${E}${p2(s % 60)}${E}s`;
  return `${Math.floor(s / 3600)}${E}h${E}${p2(Math.floor((s % 3600) / 60))}${E}min`;
}

/** Compte à rebours court pour le titre d'onglet : « 12:03 » ou « 1:05:09 ». */
export function formatCompteARebours(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

export const formatNombre = (n: number): string =>
  Math.round(n).toLocaleString("fr-FR").replace(/\s/g, ESPACE_INSECABLE).replace("-", "−");
export const formatSerenite = (n: number): string => `${n > 0 ? "+" : ""}${formatNombre(n)}`;
