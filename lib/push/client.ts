/* =====================================================================
   push/client.ts — côté navigateur des rappels push (#16)
   Détection de la prise en charge (avec repli explicite sur l'agenda), abonnement, appels à l'API.
   ===================================================================== */

import type { EtatServeurPush, SubscriptionPush } from "./schema";

export type RaisonIndispo = "serveur" | "ios-installer" | "navigateur" | "sw" | "refuse" | "hors-ligne";

export const MESSAGES_INDISPO: Record<RaisonIndispo, string> = {
  serveur: "Les notifications push ne sont pas encore configurées sur ce serveur.",
  "ios-installer":
    "Sur iPhone, les notifications ne marchent que si l’appli est installée sur l’écran d’accueil (iOS 16.4 ou plus récent) : Safari → Partager → « Sur l’écran d’accueil », puis ouvre l’appli depuis son icône.",
  navigateur: "Ce navigateur ne gère pas les notifications push (sur iPhone : iOS 16.4 minimum, appli installée).",
  sw: "Le service worker de l’appli n’est pas actif sur cette page : recharge-la (les notifications push en dépendent).",
  refuse: "Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur.",
  "hors-ligne": "Service de notifications injoignable (hors ligne ?).",
};

export interface Plateforme {
  ios: boolean;
  /** Appli lancée depuis l'écran d'accueil (PWA installée). */
  standalone: boolean;
  /** API Push + Notification + service worker présentes. */
  pushApi: boolean;
}

/** Choisit la raison d'indisponibilité à afficher, par ordre de priorité ; null si le push est possible. */
export function raisonIndispo(p: {
  cleVapid: string | undefined;
  serveur: EtatServeurPush | "injoignable";
  plateforme: Plateforme;
  permission: NotificationPermission | undefined;
}): RaisonIndispo | null {
  if (!p.cleVapid) return "serveur";
  if (p.serveur === "injoignable") return "hors-ligne";
  if (!p.serveur.disponible) return "serveur";
  if (p.plateforme.ios && !p.plateforme.standalone) return "ios-installer";
  if (!p.plateforme.pushApi) return "navigateur";
  if (p.permission === "denied") return "refuse";
  return null;
}

export function detecterPlateforme(): Plateforme {
  const nav = navigator as Navigator & { standalone?: boolean };
  /* iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile. */
  const ios = /iphone|ipad|ipod/i.test(nav.userAgent) || (/macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
  const pushApi = "serviceWorker" in nav && "PushManager" in window && typeof Notification !== "undefined";
  return { ios, standalone, pushApi };
}

/** Clé publique VAPID (base64url) → octets, pour `applicationServerKey`. */
export function cleVersOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

/** Enregistrement du service worker s'il existe (null en développement, où il n'est pas enregistré). */
export async function enregistrementSw(delaiMs = 3000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return null;
  /* `ready` attend un worker actif ; borné pour ne jamais bloquer l'interface. */
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), delaiMs)),
  ]);
}

export async function etatServeur(): Promise<EtatServeurPush | "injoignable"> {
  try {
    const r = await fetch("/api/reminders", { cache: "no-store" });
    if (!r.ok) return "injoignable";
    return (await r.json()) as EtatServeurPush;
  } catch {
    return "injoignable";
  }
}

/** Demande la permission si besoin puis s'abonne. Renvoie la subscription, ou la raison de l'échec. */
export async function sAbonner(
  reg: ServiceWorkerRegistration,
  cleVapid: string,
): Promise<{ ok: true; subscription: PushSubscription } | { ok: false; raison: RaisonIndispo }> {
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, raison: "refuse" };
  try {
    const existante = await reg.pushManager.getSubscription();
    if (existante) return { ok: true, subscription: existante };
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cleVersOctets(cleVapid),
    });
    return { ok: true, subscription };
  } catch {
    return { ok: false, raison: "navigateur" };
  }
}

export const enJson = (s: PushSubscription): SubscriptionPush => s.toJSON() as SubscriptionPush;

export type ReponseApi<T> = { ok: true; data: T } | { ok: false; erreur: string };

async function appel<T>(url: string, init: RequestInit): Promise<ReponseApi<T>> {
  try {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const corps = (await r.json().catch(() => ({}))) as T & { erreur?: string };
    return r.ok ? { ok: true, data: corps } : { ok: false, erreur: corps.erreur ?? `Erreur ${r.status}` };
  } catch {
    return { ok: false, erreur: MESSAGES_INDISPO["hors-ligne"] };
  }
}

export const planifierApi = (d: {
  subscription: SubscriptionPush;
  at: number;
  titre: string;
  corps: string;
  url: string;
  enclos: number;
}) => appel<{ messageId: string; at: number }>("/api/reminders", { method: "POST", body: JSON.stringify(d) });

export const annulerApi = (messageId: string, endpoint: string) =>
  appel<{ annule: boolean }>(`/api/reminders/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
