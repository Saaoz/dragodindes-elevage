/* =====================================================================
   push/server.ts — logique serveur des rappels push (#16)
   Fonctions indépendantes de Next : QStash, la vérification de signature et l'envoi web-push sont
   INJECTÉS, ce qui permet de tout tester avec Vitest sans réseau.
   ===================================================================== */

import {
  erreurHeure,
  messageRappelSchema,
  type DemandeRappel,
  type MessageRappel,
  type SubscriptionPush,
} from "./schema";

/* ---------- QStash ---------- */

/** Sous-ensemble du client QStash utilisé ici (voir `adaptateurQStash` dans les Route Handlers). */
export interface FileQStash {
  publier(req: { url: string; corps: MessageRappel; notBefore: number; retries: number; label: string }): Promise<{ messageId: string }>;
  lire(messageId: string): Promise<{ url: string; body?: string } | null>;
  annuler(messageId: string): Promise<void>;
}

/** Libellé QStash de nos messages (filtrage dans la console Upstash). */
export const LABEL_QSTASH = "rappel-enclos";
/** Nouvelles tentatives si /api/reminders/fire répond une erreur temporaire. */
export const TENTATIVES_QSTASH = 2;

/** Construit le corps du message QStash : la subscription voyage dans le message (pas de base de données). */
export function construireMessage(d: DemandeRappel): MessageRappel {
  return {
    v: 1,
    subscription: d.subscription,
    notification: { titre: d.titre, corps: d.corps, url: d.url, tag: `enclos-${d.enclos + 1}` },
    at: d.at,
  };
}

export type ResultatPlanification =
  | { ok: true; messageId: string; at: number }
  | { ok: false; statut: 400 | 429 | 502; erreur: string };

export async function planifierRappel(
  d: DemandeRappel,
  deps: { file: FileQStash; urlDeclenchement: string; maintenantMs: number; limite?: LimiteDebit },
): Promise<ResultatPlanification> {
  const err = erreurHeure(d.at, deps.maintenantMs);
  if (err) return { ok: false, statut: 400, erreur: err };
  if (deps.limite && !deps.limite.accepter(d.subscription.endpoint, deps.maintenantMs))
    return { ok: false, statut: 429, erreur: "Trop de rappels pour cet appareil : réessaie plus tard." };
  try {
    const r = await deps.file.publier({
      url: deps.urlDeclenchement,
      corps: construireMessage(d),
      /* QStash attend des SECONDES ; arrondi au-dessus pour ne jamais prévenir en avance. */
      notBefore: Math.ceil(d.at / 1000),
      retries: TENTATIVES_QSTASH,
      label: LABEL_QSTASH,
    });
    return { ok: true, messageId: r.messageId, at: d.at };
  } catch (e) {
    console.error("QStash : échec de la publication", e);
    return { ok: false, statut: 502, erreur: "Le service de rappel ne répond pas." };
  }
}

export type ResultatAnnulation =
  | { ok: true; annule: boolean }
  | { ok: false; statut: 403 | 502; erreur: string };

/** Annule un message, seulement si c'est un de nos rappels ET qu'il vise la même subscription. */
export async function annulerRappel(
  messageId: string,
  endpoint: string,
  deps: { file: FileQStash; urlDeclenchement: string },
): Promise<ResultatAnnulation> {
  let msg: { url: string; body?: string } | null;
  try {
    msg = await deps.file.lire(messageId);
  } catch (e) {
    console.error("QStash : lecture du message impossible", e);
    return { ok: false, statut: 502, erreur: "Le service de rappel ne répond pas." };
  }
  /* Déjà livré, déjà annulé ou inconnu : rien à faire. */
  if (!msg) return { ok: true, annule: false };
  let corps: unknown = null;
  try {
    corps = msg.body ? JSON.parse(msg.body) : null;
  } catch {
    corps = null;
  }
  const m = messageRappelSchema.safeParse(corps);
  if (msg.url !== deps.urlDeclenchement || !m.success || m.data.subscription.endpoint !== endpoint)
    return { ok: false, statut: 403, erreur: "Ce rappel n'appartient pas à cet appareil." };
  try {
    await deps.file.annuler(messageId);
    return { ok: true, annule: true };
  } catch (e) {
    console.error("QStash : annulation impossible", e);
    return { ok: false, statut: 502, erreur: "Le service de rappel ne répond pas." };
  }
}

/* ---------- limite de débit (en mémoire, par instance : protection minimale) ---------- */

export class LimiteDebit {
  private readonly vus = new Map<string, number[]>();
  constructor(
    readonly max: number,
    readonly fenetreMs: number,
    private readonly maxCles = 5000,
  ) {}

  accepter(cle: string, maintenantMs: number): boolean {
    const debut = maintenantMs - this.fenetreMs;
    const liste = (this.vus.get(cle) ?? []).filter((t) => t > debut);
    if (liste.length >= this.max) {
      this.vus.set(cle, liste);
      return false;
    }
    liste.push(maintenantMs);
    this.vus.delete(cle); // réinsertion : la Map reste triée du plus ancien au plus récent
    this.vus.set(cle, liste);
    if (this.vus.size > this.maxCles) this.vus.delete(this.vus.keys().next().value!);
    return true;
  }
}

/* ---------- signature QStash ---------- */

export interface VerifieurSignature {
  verify(req: { signature: string; body: string; url: string; clockTolerance?: number }): Promise<boolean>;
}

/** Vrai seulement si la signature est présente ET valide pour ce corps et cette URL. Ne lève jamais. */
export async function signatureValide(
  verifieur: VerifieurSignature,
  req: { signature: string | null; corps: string; url: string },
): Promise<boolean> {
  if (!req.signature) return false;
  try {
    return (await verifieur.verify({ signature: req.signature, body: req.corps, url: req.url, clockTolerance: 5 })) === true;
  } catch {
    return false;
  }
}

/** Mémorise les signatures déjà acceptées (valides 5 min) pour refuser un rejeu. Par instance. */
export class AntiRejeu {
  private readonly vues = new Map<string, number>();
  constructor(private readonly dureeMs = 6 * 60 * 1000) {}

  premiereFois(signature: string, maintenantMs: number): boolean {
    for (const [s, t] of this.vues) {
      if (t > maintenantMs - this.dureeMs) break;
      this.vues.delete(s);
    }
    if (this.vues.has(signature)) return false;
    this.vues.set(signature, maintenantMs);
    return true;
  }

  /** Libère une signature (échec temporaire : QStash doit pouvoir réessayer). */
  oublier(signature: string): void {
    this.vues.delete(signature);
  }
}

/* ---------- envoi web-push ---------- */

export interface OptionsEnvoi {
  TTL: number;
  urgency: "very-low" | "low" | "normal" | "high";
  topic?: string;
  timeout: number;
  vapidDetails: { subject: string; publicKey: string; privateKey: string };
}
export type EnvoyeurPush = (subscription: SubscriptionPush, payload: string, options: OptionsEnvoi) => Promise<unknown>;

export type ResultatEnvoi =
  /** Notification acceptée par le service push. */
  | { etat: "envoye" }
  /** Subscription expirée ou révoquée (404/410) : inutile de réessayer. */
  | { etat: "expire"; statut: number }
  /** Erreur temporaire (429, 5xx, réseau) : QStash peut réessayer. */
  | { etat: "reessayer"; statut?: number }
  /** Erreur définitive (ex. 400/403 : clés VAPID incohérentes). */
  | { etat: "echec"; statut: number };

/** Durée de conservation par le service push si le téléphone est hors ligne (s). */
export const TTL_PUSH_S = 3600;

export async function envoyerRappel(
  m: MessageRappel,
  deps: { envoyer: EnvoyeurPush; vapid: OptionsEnvoi["vapidDetails"] },
): Promise<ResultatEnvoi> {
  const payload = JSON.stringify(m.notification);
  try {
    await deps.envoyer(m.subscription, payload, {
      TTL: TTL_PUSH_S,
      urgency: "high",
      topic: m.notification.tag,
      timeout: 10_000,
      vapidDetails: deps.vapid,
    });
    return { etat: "envoye" };
  } catch (e) {
    const statut = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? (e as { statusCode: number }).statusCode : undefined;
    if (statut === 404 || statut === 410) return { etat: "expire", statut };
    if (statut === undefined || statut === 429 || statut >= 500) return { etat: "reessayer", statut };
    return { etat: "echec", statut };
  }
}
