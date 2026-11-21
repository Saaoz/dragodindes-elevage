/* Choix de la façon de se faire rappeler (#51). Fonctions pures : les capacités de l'appareil sont des paramètres. */

import { METHODES_RAPPEL, type MethodeRappel } from "./schema";

export type { MethodeRappel };

export interface Capacites {
  /** L'API Notification existe et n'est pas bloquée : le rappel « dans la page » est possible. */
  notificationPage: boolean;
}

/** Méthodes utilisables sur cet appareil, la meilleure d'abord (agenda, Google Agenda, page). */
export function methodesDisponibles(c: Capacites): MethodeRappel[] {
  return METHODES_RAPPEL.filter((m) => {
    if (m === "page") return c.notificationPage;
    return true; // l'agenda (.ics ou Google Agenda) marche partout
  });
}

/** Méthode à appliquer d'un seul appui : la mémorisée si elle marche encore ici, sinon null (rouvrir le choix). */
export function methodeAUtiliser(memorisee: MethodeRappel | null, dispo: readonly MethodeRappel[]): MethodeRappel | null {
  return memorisee !== null && dispo.includes(memorisee) ? memorisee : null;
}

export const LIBELLE_CHOIX: Record<MethodeRappel, { titre: string; detail: string }> = {
  agenda: { titre: "Dans mon agenda", detail: "Un événement avec alarme est ajouté à l’agenda de l’appareil (fichier à ouvrir). Il sonne même page fermée." },
  google: { titre: "Dans Google Agenda", detail: "Ouvre Google Agenda avec l’événement prêt à enregistrer." },
  page: { titre: "Ici, tant que la page reste ouverte", detail: "Tu n’es prévenu que si cette page reste ouverte." },
};

/** Complément de phrase après « Rappel : ». */
export const LIBELLE_ETAT: Record<MethodeRappel, string> = {
  agenda: "dans ton agenda",
  google: "dans Google Agenda",
  page: "dans cette page, tant qu’elle reste ouverte",
};
