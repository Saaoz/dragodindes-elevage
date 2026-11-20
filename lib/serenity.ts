/* =====================================================================
   serenity.ts — calcul PUR de la sérénité (issue #1), sans DOM ni React.
   Modèle (DOFUS 3.7, voir docs/serenite.md) :
   - la jauge Sérénité + ou − de niveau J se vide à la vitesse du tier où se trouve
     son niveau (TIERS de lib/data.ts, 1/2/3/4 pts/s × VITESSE_MULT) ;
   - chaque point consommé déplace la sérénité de CHAQUE monture de l'enclos d'un point
     dans le sens de la jauge, bornée à [-5 000 ; 5 000] ;
   - HYPOTHÈSE (à vérifier en jeu) : la jauge continue de se vider quand une monture est
     à la borne ; ces points sont « gaspillés » pour elle.
   ===================================================================== */

import { CAPACITE_JAUGE, TIERS } from "./data";
import type { Enclos } from "./schema";

/* ---------- constantes du modèle ---------- */

/** Borne absolue de la sérénité d'une monture : elle reste dans [-SERENITE_MAX ; SERENITE_MAX]. */
export const SERENITE_MAX = 5000;

/** Seuils dont le franchissement est signalé : bas de la Maturité, passage Endurance/Amour, haut de la Maturité. */
export const SEUILS_SERENITE = [-2000, 0, 2000] as const;

/** Zone « moyenne » (Maturité) : -2 000 à +2 000. */
export const ZONE_MATURITE: ZoneSerenite = { min: -2000, max: 2000 };

/* ---------- types ---------- */

/** Sens de la jauge de sérénité active : « + » (Sérénité +) fait monter, « - » (Sérénité −) fait baisser. */
export type SensJauge = "+" | "-";

/** Description d'un tier de jauge : niveaux de `min` à `max` (inclus), vidés à `xpS` points par seconde. */
export interface TierJauge {
  /** Niveau minimal du tier (informatif ; c'est le `max` du tier précédent qui fait foi). */
  min: number;
  /** Niveau maximal du tier, inclus. */
  max: number;
  /** Vitesse de vidage en points par seconde dans ce tier. */
  xpS: number;
}

/**
 * Paramètres de la jauge, tous facultatifs : par défaut, les valeurs de la version du jeu
 * (`TIERS` et `CAPACITE_JAUGE` de lib/data.ts).
 */
export interface ParamsJauge {
  /**
   * Capacité de la jauge. Si elle diffère du `max` du dernier tier, les seuils des tiers sont
   * mis à l'échelle proportionnellement (ex. 100 000 redonne les tiers de la 3.5).
   */
  capacite?: number;
  /** Tiers de la jauge, triés par niveau croissant (défaut : `TIERS`). */
  tiers?: readonly TierJauge[];
  /**
   * Multiplicateur appliqué EN PLUS aux vitesses des tiers (défaut 1). `TIERS` intègre déjà
   * `VITESSE_MULT` : ce paramètre sert aux tests et à un éventuel bonus (Almanax, version future).
   */
  vitesseMult?: number;
}

/** Zone de sérénité à respecter, bornes incluses (ex. Maturité : -2 000 à 2 000). */
export interface ZoneSerenite {
  min: number;
  max: number;
}

/** État d'un groupe de montures soumis à une jauge de sérénité, à un instant donné. */
export interface EtatSerenite {
  /** Sérénité de chaque monture, dans l'ordre d'entrée, bornée à ±5 000. */
  serenites: readonly number[];
  /** Jauge de sérénité active, ou null si aucune. */
  sens: SensJauge | null;
  /** Niveau (points restants) de la jauge de sérénité. */
  niveauJauge: number;
}

/** État estimé après un certain temps : l'état lui-même et les points consommés depuis le départ. */
export interface EtatEstime extends EtatSerenite {
  /** Points de jauge consommés pendant la durée écoulée. */
  pointsConsommes: number;
  /** Durée écoulée prise en compte, en secondes. */
  tempsEcoule: number;
}

/** Entrée de `serenityPlan`. */
export interface EntreePlan extends ParamsJauge {
  /** Sérénité de chaque monture de l'enclos (valeurs hors bornes ramenées à ±5 000). */
  serenites: readonly number[];
  /** Jauge de sérénité active (« + » ou « - »), ou null si aucune. */
  sens: SensJauge | null;
  /** Niveau actuel de la jauge (ramené à [0 ; capacité]). Ignoré si `sens` est null. */
  niveauJauge: number;
  /** Valeur que la monture la plus en retard doit atteindre (ex. 0). */
  cible?: number;
  /** Zone qu'aucune monture ne doit dépasser (ex. `ZONE_MATURITE`). */
  zone?: ZoneSerenite;
}

/** Type d'un événement du plan. */
export type TypeEvenement =
  /** Une monture franchit un seuil de `SEUILS_SERENITE` (-2 000, 0 ou +2 000). */
  | "seuil"
  /** Une monture arrive à la `cible`. */
  | "cible"
  /** La première monture sort de la `zone` (côté où pousse la jauge). */
  | "sortieZone"
  /** La PREMIÈRE monture atteint ±5 000 : à partir de là, des points sont gaspillés. */
  | "premiereBorne"
  /** La jauge de sérénité est vide. */
  | "jaugeVide";

/** Un événement daté du plan. */
export interface EvenementSerenite {
  type: TypeEvenement;
  /** Temps écoulé depuis le départ, en secondes. */
  temps: number;
  /** Points de jauge consommés à ce moment. */
  points: number;
  /** Indice de la monture concernée dans `serenites`, ou null (jauge vide). */
  monture: number | null;
  /** Valeur de sérénité concernée (seuil, cible, borne de zone, ±5 000) ; null pour « jaugeVide ». */
  valeur: number | null;
  /** Niveau de la jauge à ce moment. */
  niveauJauge: number;
}

/**
 * Diagnostic de `aRemplir` :
 * - `ok` : objectif atteignable ;
 * - `dejaAtteint` : rien à mettre, l'objectif est déjà rempli ;
 * - `tropEcartees` : sérénités trop écartées, voir `groupes` ;
 * - `sensIncoherent` : la jauge active éloigne le groupe de l'objectif, voir `sensConseille` ;
 * - `horsZone` : une monture est déjà au-delà de la zone dans le sens de la jauge ;
 * - `aucuneMonture` : liste vide.
 */
export type StatutRemplissage = "ok" | "dejaAtteint" | "tropEcartees" | "sensIncoherent" | "horsZone" | "aucuneMonture";

/** Recommandation : combien de points mettre dans la jauge de sérénité. */
export interface Remplissage {
  statut: StatutRemplissage;
  /** true si l'objectif peut être atteint sans qu'aucune monture ne dépasse la limite. */
  atteignable: boolean;
  /** Sens de jauge à utiliser pour cet objectif (null si aucun mouvement utile). */
  sensConseille: SensJauge | null;
  /** Niveau total de jauge conseillé (points à consommer au total). */
  points: number;
  /** Points minimaux pour que la monture la plus en retard atteigne l'objectif. */
  pointsMin: number;
  /** Points maximaux avant que la monture la plus avancée ne dépasse la limite. */
  pointsMax: number;
  /** Points à AJOUTER à la jauge actuelle pour atteindre `points` (0 si déjà assez). */
  aAjouter: number;
  /** Points de trop dans la jauge actuelle par rapport à `pointsMax` (il faudra revenir avant). */
  excedent: number;
  /** Temps pour consommer `points` depuis un niveau `points`, en secondes. */
  duree: number;
  /** Écart actuel entre la plus haute et la plus basse sérénité. */
  ecart: number;
  /** Écart maximal compatible avec l'objectif (au-delà : regrouper). */
  ecartMax: number;
  /** Proposition de regroupement (indices des montures), seulement si `tropEcartees`. */
  groupes: number[][] | null;
  /** Message prêt à afficher, en français. */
  message: string;
}

/** Résultat de `serenityPlan`. */
export interface PlanSerenite {
  /** Sérénité de chaque monture quand la jauge sera vide (bornée à ±5 000). */
  final: number[];
  /** Événements triés par temps croissant. */
  evenements: EvenementSerenite[];
  /** Temps avant que la jauge soit vide, en secondes (0 si aucune jauge). */
  tempsVide: number;
  /** Points de jauge brûlés pour chaque monture une fois ±5 000 atteint. */
  gaspillage: number[];
  /** Recommandation de remplissage. */
  aRemplir: Remplissage;
}

/* ---------- utilitaires internes ---------- */

interface Palier {
  /** borne basse exclue du palier */
  bas: number;
  /** borne haute incluse */
  haut: number;
  vitesse: number;
}

const fini = (n: number, defaut = 0): number => (typeof n === "number" && Number.isFinite(n) ? n : defaut);
const borner = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, fini(n, a)));

/** Ramène une sérénité dans [-5 000 ; 5 000] (valeur non numérique → 0). */
export const bornerSerenite = (s: number): number => borner(fini(s, 0), -SERENITE_MAX, SERENITE_MAX);

/** Signe du sens : +1 pour « + », -1 pour « - ». */
const signe = (sens: SensJauge): 1 | -1 => (sens === "+" ? 1 : -1);

/** Capacité effective de la jauge pour ces paramètres. */
export function capaciteJauge(p: ParamsJauge = {}): number {
  const base = p.tiers ?? TIERS;
  const dernier = base.length ? base[base.length - 1].max : CAPACITE_JAUGE;
  const cap = p.capacite ?? (p.tiers ? dernier : CAPACITE_JAUGE);
  if (!(cap > 0) || !Number.isFinite(cap)) throw new RangeError("capacité de jauge invalide");
  return cap;
}

function paliers(p: ParamsJauge = {}): Palier[] {
  const base = p.tiers ?? TIERS;
  if (!base.length) throw new RangeError("aucun tier de jauge");
  const cap = capaciteJauge(p);
  const echelle = cap / base[base.length - 1].max;
  const mult = p.vitesseMult ?? 1;
  let bas = 0;
  return base.map((t, i) => {
    const vitesse = t.xpS * mult;
    if (!(vitesse > 0) || !Number.isFinite(vitesse)) throw new RangeError("vitesse de tier invalide");
    const haut = i === base.length - 1 ? cap : t.max * echelle;
    const palier = { bas, haut, vitesse };
    bas = haut;
    return palier;
  });
}

/** Niveau de jauge ramené à [0 ; capacité]. */
export const bornerNiveau = (niveau: number, p: ParamsJauge = {}): number => borner(niveau, 0, capaciteJauge(p));

/** Vitesse de vidage (pts/s) quand la jauge est au niveau donné (le niveau 0 a la vitesse du tier 1). */
export function vitesseAuNiveau(niveau: number, p: ParamsJauge = {}): number {
  const ps = paliers(p);
  const n = bornerNiveau(niveau, p);
  return (ps.find((x) => n <= x.haut) ?? ps[ps.length - 1]).vitesse;
}

/**
 * Temps (s) pour consommer `points` depuis une jauge au niveau `niveau`, en intégrant par morceaux
 * sur les tiers (le débit baisse quand le niveau passe sous un seuil de tier).
 * Renvoie `Infinity` si `points` dépasse le niveau (la jauge sera vide avant) ; 0 si `points` ≤ 0.
 */
export function tempsPourConsommer(niveau: number, points: number, p: ParamsJauge = {}): number {
  const n = bornerNiveau(niveau, p);
  const d = fini(points, 0);
  if (d <= 0) return 0;
  if (d > n + 1e-9) return Infinity;
  const fin = Math.max(0, n - d);
  let t = 0;
  for (const x of paliers(p)) {
    const recouvrement = Math.min(n, x.haut) - Math.max(fin, x.bas);
    if (recouvrement > 0) t += recouvrement / x.vitesse;
  }
  return t;
}

/** Points consommés après `secondes` depuis une jauge au niveau `niveau` (au plus `niveau`). */
export function pointsConsommes(niveau: number, secondes: number, p: ParamsJauge = {}): number {
  const n = bornerNiveau(niveau, p);
  let reste = Math.max(0, fini(secondes, 0));
  let courant = n;
  const ps = paliers(p);
  for (let i = ps.length - 1; i >= 0 && courant > 0 && reste > 0; i--) {
    const x = ps[i];
    if (courant <= x.bas) continue;
    const dispo = courant - x.bas;
    const duree = dispo / x.vitesse;
    if (reste >= duree) {
      courant = x.bas;
      reste -= duree;
    } else {
      courant -= reste * x.vitesse;
      reste = 0;
    }
  }
  return n - courant;
}

/** Temps (s) pour vider entièrement une jauge au niveau donné. */
export const tempsVidage = (niveau: number, p: ParamsJauge = {}): number =>
  tempsPourConsommer(niveau, bornerNiveau(niveau, p), p);

/** Sérénité d'une monture après `points` consommés dans le sens donné (bornée à ±5 000). */
export function deplacer(serenite: number, sens: SensJauge | null, points: number): number {
  const s = bornerSerenite(serenite);
  if (sens === null) return s;
  return bornerSerenite(s + signe(sens) * Math.max(0, fini(points, 0)));
}

/**
 * État estimé au bout de `secondes` : niveau de jauge restant et sérénité de chaque monture.
 * Sert à afficher « la sérénité estimée maintenant » à partir de l'heure de saisie (#2).
 */
export function etatApres(etat: EtatSerenite, secondes: number, p: ParamsJauge = {}): EtatEstime {
  const tempsEcoule = Math.max(0, fini(secondes, 0));
  const niveau = bornerNiveau(etat.niveauJauge, p);
  const conso = etat.sens === null ? 0 : pointsConsommes(niveau, tempsEcoule, p);
  return {
    serenites: etat.serenites.map((s) => deplacer(s, etat.sens, conso)),
    sens: etat.sens,
    niveauJauge: niveau - conso,
    pointsConsommes: conso,
    tempsEcoule,
  };
}

/** Convertit un enclos du schéma (lib/schema.ts) en état de sérénité, tel que saisi. */
export const etatDeEnclos = (enclos: Enclos): EtatSerenite => ({
  serenites: enclos.montures.map((m) => m.serenite),
  sens: enclos.jaugeSerenite,
  niveauJauge: enclos.jaugeSerenite === null ? 0 : enclos.niveauSerenite,
});

/**
 * État estimé d'un enclos à l'instant `maintenantMs` (horodatage ms), à partir de sa saisie
 * (`saisieLe`). Sans horodatage, renvoie l'état saisi tel quel.
 */
export function etatEnclos(enclos: Enclos, maintenantMs: number, p: ParamsJauge = {}): EtatEstime {
  const secondes = enclos.saisieLe === null ? 0 : (fini(maintenantMs, enclos.saisieLe) - enclos.saisieLe) / 1000;
  return etatApres(etatDeEnclos(enclos), secondes, p);
}

/* ---------- aRemplir ---------- */

/** Regroupe des valeurs (orientées) en groupes d'écart ≤ ecartMax, par balayage des valeurs triées. */
function regrouper(valeurs: readonly number[], ecartMax: number): number[][] {
  const tries = valeurs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const groupes: number[][] = [];
  let debut = -Infinity;
  for (const { v, i } of tries) {
    if (groupes.length && v - debut <= ecartMax + 1e-9) groupes[groupes.length - 1].push(i);
    else {
      groupes.push([i]);
      debut = v;
    }
  }
  return groupes.map((g) => g.sort((a, b) => a - b));
}

const fmt = (n: number): string => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

function calculerRemplissage(
  serenites: readonly number[],
  sensActif: SensJauge | null,
  niveau: number,
  cible: number | undefined,
  zone: ZoneSerenite | undefined,
  p: ParamsJauge,
): Remplissage {
  const cap = capaciteJauge(p);
  const vide: Remplissage = {
    statut: "aucuneMonture",
    atteignable: false,
    sensConseille: null,
    points: 0,
    pointsMin: 0,
    pointsMax: 0,
    aAjouter: 0,
    excedent: 0,
    duree: 0,
    ecart: 0,
    ecartMax: 0,
    groupes: null,
    message: "Aucune monture dans l'enclos.",
  };
  if (!serenites.length) return vide;
  if (sensActif === null && cible === undefined && !zone)
    return { ...vide, statut: "dejaAtteint", atteignable: true, message: "Aucune jauge de sérénité active et aucun objectif." };

  const bas = Math.min(...serenites);
  const haut = Math.max(...serenites);
  const ecart = haut - bas;

  /* Sens utile : celui de la jauge active, sinon celui qui rapproche le groupe de l'objectif. */
  const centreGroupe = (bas + haut) / 2;
  const viseNaturel = cible ?? (zone ? (zone.min + zone.max) / 2 : undefined);
  const sensObjectif: SensJauge | null =
    viseNaturel === undefined ? null : viseNaturel > centreGroupe ? "+" : viseNaturel < centreGroupe ? "-" : null;
  const sens: SensJauge = sensActif ?? sensObjectif ?? "+";
  const s = signe(sens);

  /* Coordonnées orientées : on pousse toujours « vers le haut ». */
  const orient = serenites.map((v) => s * v);
  const min = Math.min(...orient);
  const max = Math.max(...orient);
  const zLo = zone ? Math.min(s * zone.min, s * zone.max) : -SERENITE_MAX;
  const zHi = zone ? Math.max(s * zone.min, s * zone.max) : SERENITE_MAX;
  const limite = zone ? zHi : SERENITE_MAX;
  const objectif = cible !== undefined ? s * bornerSerenite(cible) : zone ? zLo : limite;

  const pointsMax = Math.max(0, limite - max);
  const pointsMinBrut = objectif - min;
  const pointsMin = Math.max(0, pointsMinBrut);
  const ecartMax = Math.max(0, limite - objectif);
  const sansObjectif = cible === undefined && !zone;

  let statut: StatutRemplissage;
  let points: number;
  let groupes: number[][] | null = null;

  if (sansObjectif) {
    /* Sans objectif : le maximum utile sans gaspiller (la première monture s'arrête à ±5 000). */
    statut = pointsMax > 0 ? "ok" : "dejaAtteint";
    points = pointsMax;
  } else if (
    (cible !== undefined && pointsMinBrut < 0) ||
    (cible === undefined && zone !== undefined && min > zHi)
  ) {
    /* Toutes les montures sont déjà au-delà de l'objectif dans le sens de la jauge : il faut l'autre jauge. */
    statut = "sensIncoherent";
    points = 0;
  } else if (max > limite) {
    statut = "horsZone";
    points = 0;
  } else if (pointsMin > pointsMax) {
    statut = "tropEcartees";
    points = pointsMax;
    groupes = regrouper(orient, ecartMax);
  } else {
    if (cible !== undefined) points = pointsMin;
    else {
      /* Zone seule : centrer le groupe dans la zone, sans sortir de [pointsMin ; pointsMax]. */
      const centre = (zLo + zHi) / 2 - (min + max) / 2;
      points = Math.min(pointsMax, Math.max(pointsMin, centre));
    }
    statut = points > 0 ? "ok" : "dejaAtteint";
  }

  points = Math.min(points, cap);
  const atteignable = statut === "ok" || statut === "dejaAtteint";
  const niveauActif = sensActif === sens ? niveau : 0;
  const aAjouter = statut === "sensIncoherent" ? 0 : Math.max(0, points - niveauActif);
  const excedent = sensActif === sens ? Math.max(0, niveau - pointsMax) : 0;
  const nomJauge = sens === "+" ? "Sérénité +" : "Sérénité −";
  const autre: SensJauge = sens === "+" ? "-" : "+";

  let message: string;
  switch (statut) {
    case "ok":
      message = `Mets ${fmt(points)} points au total dans la jauge ${nomJauge}${
        aAjouter > 0 && niveauActif > 0 ? ` (ajoute ${fmt(aAjouter)})` : ""
      } : pas besoin de revenir avant qu'elle soit vide.`;
      break;
    case "dejaAtteint":
      message = "Objectif déjà atteint : aucun point de sérénité à mettre.";
      break;
    case "tropEcartees":
      message = `Sérénités trop écartées (${fmt(ecart)} d'écart, ${fmt(ecartMax)} au plus) : regroupe les montures de sérénité proche dans le même enclos (${groupes?.length ?? 0} groupes). Au mieux, mets ${fmt(points)} points dans ${nomJauge}.`;
      break;
    case "sensIncoherent":
      message = `La jauge ${nomJauge} éloigne les montures de l'objectif : utilise ${autre === "+" ? "Sérénité +" : "Sérénité −"}.`;
      break;
    case "horsZone":
      message = `Une monture est déjà hors de la zone voulue : ne mets pas de ${nomJauge}, déplace-la ou utilise ${autre === "+" ? "Sérénité +" : "Sérénité −"}.`;
      break;
    default:
      message = "";
  }
  if (excedent > 0 && statut !== "sensIncoherent")
    message += ` Attention : la jauge contient ${fmt(excedent)} points de trop, reviens la couper à temps.`;

  return {
    statut,
    atteignable,
    sensConseille: statut === "sensIncoherent" ? autre : statut === "dejaAtteint" || statut === "horsZone" ? null : sens,
    points,
    pointsMin,
    pointsMax,
    aAjouter,
    excedent,
    duree: tempsPourConsommer(points, points, p),
    ecart,
    ecartMax,
    groupes,
    message,
  };
}

/* ---------- serenityPlan ---------- */

const ORDRE_TYPES: Record<TypeEvenement, number> = {
  seuil: 0,
  cible: 1,
  sortieZone: 2,
  premiereBorne: 3,
  jaugeVide: 4,
};

/**
 * Plan complet de sérénité pour un enclos : sérénités finales, événements datés, temps avant
 * jauge vide, gaspillage par monture et recommandation `aRemplir`.
 * Les temps sont en secondes à partir de l'état fourni.
 */
export function serenityPlan(entree: EntreePlan): PlanSerenite {
  const p: ParamsJauge = { capacite: entree.capacite, tiers: entree.tiers, vitesseMult: entree.vitesseMult };
  const serenites = entree.serenites.map(bornerSerenite);
  const sens = entree.sens;
  const niveau = sens === null ? 0 : bornerNiveau(entree.niveauJauge, p);
  const cible = entree.cible === undefined ? undefined : bornerSerenite(entree.cible);
  const zone = entree.zone
    ? {
        min: bornerSerenite(Math.min(entree.zone.min, entree.zone.max)),
        max: bornerSerenite(Math.max(entree.zone.min, entree.zone.max)),
      }
    : undefined;

  const evenements: EvenementSerenite[] = [];
  const ajouter = (type: TypeEvenement, points: number, monture: number | null, valeur: number | null) => {
    if (points < 0 || points > niveau) return;
    evenements.push({
      type,
      temps: tempsPourConsommer(niveau, points, p),
      points,
      monture,
      valeur,
      niveauJauge: niveau - points,
    });
  };

  let final = serenites.slice();
  let gaspillage = serenites.map(() => 0);

  if (sens !== null) {
    const s = signe(sens);
    final = serenites.map((v) => deplacer(v, sens, niveau));
    gaspillage = serenites.map((v) => Math.max(0, niveau - (SERENITE_MAX - s * v)));

    serenites.forEach((v, i) => {
      for (const seuil of SEUILS_SERENITE) {
        const d = s * (seuil - v);
        if (d > 0) ajouter("seuil", d, i, seuil);
      }
      if (cible !== undefined) {
        const d = s * (cible - v);
        if (d > 0) ajouter("cible", d, i, cible);
      }
    });

    if (serenites.length) {
      const orient = serenites.map((v) => s * v);
      const max = Math.max(...orient);
      const premier = orient.indexOf(max);
      ajouter("premiereBorne", SERENITE_MAX - max, premier, s * SERENITE_MAX);
      if (zone) {
        const limite = s > 0 ? zone.max : -zone.min;
        const d = limite - max;
        /* « sortir » = dépasser strictement la borne : signalé au moment où elle est atteinte */
        if (d >= 0 && limite < SERENITE_MAX) ajouter("sortieZone", d, premier, s * limite);
      }
    }
    if (niveau > 0) ajouter("jaugeVide", niveau, null, null);
  }

  evenements.sort(
    (a, b) => a.temps - b.temps || a.points - b.points || ORDRE_TYPES[a.type] - ORDRE_TYPES[b.type] || (a.monture ?? -1) - (b.monture ?? -1),
  );

  return {
    final,
    evenements,
    tempsVide: sens === null ? 0 : tempsVidage(niveau, p),
    gaspillage,
    aRemplir: calculerRemplissage(serenites, sens, niveau, cible, zone, p),
  };
}

/**
 * Plan de sérénité d'un enclos du schéma (lib/schema.ts) à l'instant `maintenantMs` :
 * l'état est d'abord estimé à partir de `saisieLe`, puis planifié. Les temps des événements
 * sont relatifs à `maintenantMs` (heure de retour = maintenantMs + temps × 1 000).
 */
export function planEnclos(
  enclos: Enclos,
  maintenantMs: number,
  options: { cible?: number; zone?: ZoneSerenite } & ParamsJauge = {},
): PlanSerenite & { etat: EtatEstime } {
  const p: ParamsJauge = { capacite: options.capacite, tiers: options.tiers, vitesseMult: options.vitesseMult };
  const etat = etatEnclos(enclos, maintenantMs, p);
  const plan = serenityPlan({ ...p, ...etat, cible: options.cible, zone: options.zone });
  return { ...plan, etat };
}
