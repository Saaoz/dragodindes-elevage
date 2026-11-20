/* =====================================================================
   push/config.ts — configuration serveur des rappels push (#16)
   Tout vient des variables d'environnement (dépôt public : aucun secret dans le code).
   Si une variable manque, la fonctionnalité est simplement désactivée, sans planter.
   ===================================================================== */

export type Env = Readonly<Record<string, string | undefined>>;

export interface ConfigVapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}
export interface ConfigPush {
  vapid: ConfigVapid;
  qstashToken: string;
  /** Adresse de l'API QStash (facultative : QSTASH_URL, ex. région UE ou serveur de dev). */
  qstashUrl?: string;
  signingKeys: { current: string; next: string };
  /** URL publique de POST /api/reminders/fire (destination des messages QStash). */
  urlDeclenchement: string;
}

export type ResultatConfig<T> = { ok: true; config: T } | { ok: false; manque: string[] };

const val = (env: Env, nom: string): string | undefined => {
  const v = env[nom]?.trim();
  return v ? v : undefined;
};

/** Origine publique de l'appli : APP_URL, sinon les variables fournies par Vercel. */
export function originePublique(env: Env): string | undefined {
  const explicite = val(env, "APP_URL");
  if (explicite) return explicite.replace(/\/+$/, "");
  const prod = val(env, "VERCEL_PROJECT_PRODUCTION_URL");
  if (val(env, "VERCEL_ENV") === "production" && prod) return `https://${prod}`;
  const deploiement = val(env, "VERCEL_URL");
  return deploiement ? `https://${deploiement}` : undefined;
}

export const CHEMIN_DECLENCHEMENT = "/api/reminders/fire";

function lire<T>(env: Env, noms: readonly string[], fabrique: (v: Record<string, string>) => T): ResultatConfig<T> {
  const manque = noms.filter((n) => !val(env, n));
  if (manque.length) return { ok: false, manque };
  return { ok: true, config: fabrique(Object.fromEntries(noms.map((n) => [n, val(env, n)!]))) };
}

export const VARS_VAPID = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
export const VARS_SIGNATURE = ["QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"] as const;

export const configVapid = (env: Env) =>
  lire(env, VARS_VAPID, (v) => ({
    publicKey: v.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: v.VAPID_PRIVATE_KEY,
    subject: v.VAPID_SUBJECT,
  }));

export const configSignature = (env: Env) =>
  lire(env, VARS_SIGNATURE, (v) => ({ current: v.QSTASH_CURRENT_SIGNING_KEY, next: v.QSTASH_NEXT_SIGNING_KEY }));

/** Configuration complète (planification + envoi). */
export function configPush(env: Env): ResultatConfig<ConfigPush> {
  const manque: string[] = [];
  const vapid = configVapid(env);
  if (!vapid.ok) manque.push(...vapid.manque);
  const sig = configSignature(env);
  if (!sig.ok) manque.push(...sig.manque);
  const token = val(env, "QSTASH_TOKEN");
  if (!token) manque.push("QSTASH_TOKEN");
  const origine = originePublique(env);
  if (!origine) manque.push("APP_URL (ou VERCEL_URL)");
  if (!vapid.ok || !sig.ok || !token || !origine) return { ok: false, manque };
  return {
    ok: true,
    config: {
      vapid: vapid.config,
      qstashToken: token,
      qstashUrl: val(env, "QSTASH_URL"),
      signingKeys: sig.config,
      urlDeclenchement: `${origine}${CHEMIN_DECLENCHEMENT}`,
    },
  };
}
