/* Rappels sans serveur (#2, niveau 1) : fichier .ics (RFC 5545) et lien Google Agenda.
   Fonctions pures : l'heure « maintenant » est passée en paramètre, rien ne lit l'horloge. */

export interface EvenementAgenda {
  /** Identifiant stable (même UID = l'agenda met à jour l'événement au lieu d'en créer un autre). */
  uid: string;
  titre: string;
  description?: string;
  /** Début de l'événement, ms depuis l'époque. */
  debutMs: number;
  /** Durée en minutes (défaut 10). */
  dureeMin?: number;
  /** Alarme déclenchée N minutes avant le début (défaut 0 = au début). */
  alarmeMin?: number;
  /** Horodatage de création (DTSTAMP), ms. */
  maintenantMs: number;
}

/** Date UTC au format iCalendar : 20261120T214000Z. */
export function dateIcs(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Échappe un texte de propriété iCalendar (\, ;, , et retours à la ligne). */
export function echapperIcs(texte: string): string {
  return texte.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Plie une ligne à 75 octets UTF-8 au plus (suites préfixées d'une espace), sans couper un caractère. */
export function plierLigne(ligne: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let courant = "";
  let octets = 0;
  for (const c of ligne) {
    const n = enc.encode(c).length;
    const limite = out.length === 0 ? 75 : 74; // la continuation commence par une espace
    if (octets + n > limite) {
      out.push(courant);
      courant = "";
      octets = 0;
    }
    courant += c;
    octets += n;
  }
  out.push(courant);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`));
}

export function construireIcs(e: EvenementAgenda): string {
  const duree = e.dureeMin ?? 10;
  const alarme = e.alarmeMin ?? 0;
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dragodindes-elevage//Mes enclos//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dateIcs(e.maintenantMs)}`,
    `DTSTART:${dateIcs(e.debutMs)}`,
    `DTEND:${dateIcs(e.debutMs + duree * 60_000)}`,
    `SUMMARY:${echapperIcs(e.titre)}`,
    ...(e.description ? [`DESCRIPTION:${echapperIcs(e.description)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${echapperIcs(e.titre)}`,
    alarme > 0 ? `TRIGGER:-PT${Math.round(alarme)}M` : "TRIGGER:PT0S",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lignes.flatMap(plierLigne).join("\r\n") + "\r\n";
}

/** Lien « ajouter à Google Agenda » prérempli (ouvre le formulaire de création). */
export function lienGoogleAgenda(e: EvenementAgenda): string {
  const fin = e.debutMs + (e.dureeMin ?? 10) * 60_000;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.titre, dates: `${dateIcs(e.debutMs)}/${dateIcs(fin)}` });
  if (e.description) p.set("details", e.description);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Nom de fichier sûr (ASCII) pour le téléchargement. */
export function nomFichierIcs(base: string): string {
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "rappel"}.ics`;
}
