/* Contenu et heure du rappel push d'un enclos (#16). Fonction pure : « maintenant » est un paramètre. */

import { formatHeure, MARGE_RETOUR_S, vueEnclos, type Objectif } from "../enclos";
import type { Enclos } from "../schema";
import { MAX_DELAI_MS } from "./schema";

/** En dessous de ce délai, un push n'a plus d'intérêt (et risquerait d'arriver en retard). */
export const DELAI_MIN_MS = 60_000;

export type ContenuRappel =
  | { ok: true; at: number; titre: string; corps: string; url: string; enclos: number }
  | { ok: false; raison: string };

export function contenuRappel(
  enclos: Enclos,
  index: number,
  objectif: Objectif,
  maintenantMs: number,
  margeS: number = MARGE_RETOUR_S,
): ContenuRappel {
  const vue = vueEnclos(enclos, index, maintenantMs, objectif);
  if (!vue.retour) return { ok: false, raison: "Pas d’heure de retour à prévoir pour cet enclos." };
  /* Jamais de notification pour une heure déjà passée (#31) : il faut ressaisir l'enclos. */
  if (vue.retardS !== null) return { ok: false, raison: "Heure de retour dépassée : ressaisis l’enclos pour une nouvelle heure." };
  /* Même marge que l'agenda (réglable) : on prévient quelques minutes avant l'échéance. */
  const at = Math.round(vue.retour.quandMs - Math.max(0, margeS) * 1000);
  if (at - maintenantMs < DELAI_MIN_MS) return { ok: false, raison: "Le retour est imminent : pas de notification." };
  if (at - maintenantMs > MAX_DELAI_MS) return { ok: false, raison: "Retour dans plus de 7 jours : utilise l’agenda." };
  const nom = enclos.nom || `Enclos ${index + 1}`;
  const avant = formatHeure(vue.retour.quandMs, at);
  return {
    ok: true,
    at,
    titre: `${nom} : reviens à l’enclos`.slice(0, 100),
    corps: vue.alerte
      ? `Reviens avant ${avant} : une monture va atteindre la limite de sérénité.`
      : `Reviens avant ${avant} pour ne pas gaspiller la jauge de sérénité.`,
    url: `/enclos#enclos-${index + 1}`,
    enclos: index,
  };
}
