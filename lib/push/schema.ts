/* =====================================================================
   push/schema.ts — schémas Zod des rappels push (#16), partagés client / serveur
   Aucune dépendance Node : importable depuis le navigateur.
   ===================================================================== */

import { z } from "zod";
import { NB_ENCLOS } from "../schema";

/** Délai maximal d'un rappel (QStash, offre gratuite : 7 jours). */
export const MAX_DELAI_MS = 7 * 24 * 3600 * 1000;
/** Taille maximale acceptée pour un corps de requête (octets). */
export const MAX_CORPS_OCTETS = 8 * 1024;

/* Services push des navigateurs : la subscription voyage dans le message QStash et le serveur
   enverra une requête vers `endpoint`. On n'accepte donc QUE les services push connus (aucun
   appel vers une adresse arbitraire). Un domaine couvre aussi ses sous-domaines. */
export const SERVICES_PUSH = [
  "fcm.googleapis.com", // Chrome, Edge Android, Samsung Internet…
  "android.googleapis.com",
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari macOS / iOS 16.4+ (web.push.apple.com)
  "notify.windows.com", // Edge Windows (wns2-*.notify.windows.com)
] as const;

export function serviceAutorise(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const h = url.hostname.toLowerCase();
  return SERVICES_PUSH.some((d) => h === d || h.endsWith(`.${d}`));
}

const base64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** PushSubscription telle que produite par `subscription.toJSON()`. */
export const subscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(serviceAutorise, "Service push inconnu ou adresse invalide."),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: base64url(200), auth: base64url(64) }),
});
export type SubscriptionPush = z.infer<typeof subscriptionSchema>;

/** Contenu affiché par le service worker (public/sw.js). */
export const notificationSchema = z.object({
  titre: z.string().trim().min(1).max(100),
  corps: z.string().trim().max(300).default(""),
  /** Chemin interne de l'appli uniquement (jamais un autre site). */
  url: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[^\s\\]*$/, "Chemin interne attendu (ex. /enclos#enclos-1).")
    .default("/enclos"),
  /** Étiquette : une notification plus récente remplace la précédente du même enclos. */
  tag: z.string().max(32).regex(/^[A-Za-z0-9_-]*$/).optional(),
});
export type NotificationPush = z.infer<typeof notificationSchema>;

/** Corps de POST /api/reminders. `at` : heure d'envoi, ms depuis l'époque. */
export const demandeRappelSchema = z.object({
  subscription: subscriptionSchema,
  at: z.number().int().positive(),
  titre: notificationSchema.shape.titre,
  corps: notificationSchema.shape.corps,
  url: notificationSchema.shape.url,
  enclos: z.number().int().min(0).max(NB_ENCLOS - 1),
});
export type DemandeRappel = z.infer<typeof demandeRappelSchema>;

/** Corps de DELETE /api/reminders/:id : prouve que l'appelant détient la subscription. */
export const annulationSchema = z.object({ endpoint: z.string().min(1).max(1024) });

/** Corps du message QStash, reçu par POST /api/reminders/fire. */
export const messageRappelSchema = z.object({
  v: z.literal(1),
  subscription: subscriptionSchema,
  notification: notificationSchema,
  at: z.number().int().positive(),
});
export type MessageRappel = z.infer<typeof messageRappelSchema>;

/** Identifiant de message QStash (ex. msg_2Xk…). */
export const idMessageSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** `at` doit être dans le futur et à moins de 7 jours. Renvoie un message d'erreur ou null. */
export function erreurHeure(at: number, maintenantMs: number): string | null {
  if (at <= maintenantMs) return "L'heure du rappel est déjà passée.";
  if (at - maintenantMs > MAX_DELAI_MS) return "Rappel trop lointain (7 jours au plus).";
  return null;
}

/** Réponse de GET /api/reminders : le push est-il utilisable sur ce serveur ? */
export type EtatServeurPush = { disponible: true } | { disponible: false; raison: string };
