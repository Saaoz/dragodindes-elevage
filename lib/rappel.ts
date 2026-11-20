/* Choix de la façon de se faire rappeler (#51). Fonctions pures : les capacités de l'appareil sont des paramètres. */

import type { RaisonIndispo } from "./push/client";
import { METHODES_RAPPEL, type MethodeRappel } from "./schema";

export type { MethodeRappel };

/** État du push sur cet appareil, tel que calculé par `usePush`. */
export type CapacitePush = "chargement" | "pret" | { indisponible: RaisonIndispo };

export interface Capacites {
  push: CapacitePush;
  /** L'API Notification existe et n'est pas bloquée : le rappel « dans la page » est possible. */
  notificationPage: boolean;
}

/** Méthodes utilisables sur cet appareil, la meilleure d'abord (téléphone, agenda, Google Agenda, page). */
export function methodesDisponibles(c: Capacites): MethodeRappel[] {
  return METHODES_RAPPEL.filter((m) => {
    if (m === "push") return c.push === "pret";
    if (m === "page") return c.notificationPage;
    return true; // l'agenda (.ics ou Google Agenda) marche partout
  });
}

/** Méthode à appliquer d'un seul appui : la mémorisée si elle marche encore ici, sinon null (rouvrir le choix). */
export function methodeAUtiliser(memorisee: MethodeRappel | null, dispo: readonly MethodeRappel[]): MethodeRappel | null {
  return memorisee !== null && dispo.includes(memorisee) ? memorisee : null;
}

/** Une phrase simple expliquant pourquoi la notification sur le téléphone manque ; null si rien à dire au joueur. */
export function phraseSansPush(c: CapacitePush): string | null {
  if (c === "pret" || c === "chargement") return null;
  switch (c.indisponible) {
    case "serveur":
      return null; // pas configuré côté serveur : rien que le joueur puisse faire
    case "ios-installer":
      return "Pour être prévenu sur ton iPhone même page fermée, installe l’appli sur l’écran d’accueil (Safari → Partager → « Sur l’écran d’accueil »), puis ouvre-la depuis son icône.";
    case "navigateur":
      return "Ce navigateur ne permet pas les notifications sur le téléphone.";
    case "sw":
      return "Recharge la page pour pouvoir recevoir des notifications sur ce téléphone.";
    case "refuse":
      return "Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur pour être prévenu sur ce téléphone.";
    case "hors-ligne":
      return "Les notifications sur ce téléphone sont injoignables pour le moment (pas de connexion ?).";
  }
}

export const LIBELLE_CHOIX: Record<MethodeRappel, { titre: string; detail: string }> = {
  push: { titre: "Sur mon téléphone (notification)", detail: "Tu es prévenu même si la page est fermée." },
  agenda: { titre: "Dans mon agenda", detail: "Un événement avec alarme est ajouté à l’agenda de l’appareil (fichier à ouvrir)." },
  google: { titre: "Dans Google Agenda", detail: "Ouvre Google Agenda avec l’événement prêt à enregistrer." },
  page: { titre: "Ici, tant que la page reste ouverte", detail: "Tu n’es prévenu que si cette page reste ouverte." },
};

/** Complément de phrase après « Rappel : ». */
export const LIBELLE_ETAT: Record<MethodeRappel, string> = {
  push: "sur ce téléphone",
  agenda: "dans ton agenda",
  google: "dans Google Agenda",
  page: "dans cette page, tant qu’elle reste ouverte",
};
