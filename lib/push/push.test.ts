import { Receiver } from "@upstash/qstash";
import { describe, expect, it, vi } from "vitest";
import { CLE_TEST_COURANTE, CLE_TEST_SUIVANTE, SUB, signer } from "./__tests__/aides";
import { cleVersOctets, raisonIndispo, type Plateforme } from "./client";
import { configPush, originePublique } from "./config";
import { contenuRappel } from "./rappel-enclos";
import { demandeRappelSchema, erreurHeure, MAX_DELAI_MS, messageRappelSchema, serviceAutorise } from "./schema";
import {
  AntiRejeu,
  annulerRappel,
  construireMessage,
  envoyerRappel,
  LimiteDebit,
  planifierRappel,
  signatureValide,
  type FileQStash,
} from "./server";
import { enclosSchema } from "../schema";

const T0 = Date.UTC(2026, 10, 20, 20, 0, 0);
const URL_FIRE = "https://dragodindes-elevage.vercel.app/api/reminders/fire";
const demande = (patch: Record<string, unknown> = {}) => ({
  subscription: SUB,
  at: T0 + 30 * 60_000,
  titre: "Enclos 1 : reviens à l’enclos",
  corps: "Reviens avant 21 h 40.",
  url: "/enclos#enclos-1",
  enclos: 0,
  ...patch,
});

/* ---------- validation ---------- */
describe("validation du corps de POST /api/reminders", () => {
  it("accepte une demande correcte", () => {
    expect(demandeRappelSchema.safeParse(demande()).success).toBe(true);
  });

  it.each([
    ["service push inconnu", { subscription: { ...SUB, endpoint: "https://evil.example.com/push" } }],
    ["endpoint en http", { subscription: { ...SUB, endpoint: "http://fcm.googleapis.com/fcm/send/x" } }],
    ["endpoint avec port", { subscription: { ...SUB, endpoint: "https://fcm.googleapis.com:8443/x" } }],
    ["faux sous-domaine", { subscription: { ...SUB, endpoint: "https://fcm.googleapis.com.evil.io/x" } }],
    ["clés manquantes", { subscription: { endpoint: SUB.endpoint } }],
    ["clé auth trop longue", { subscription: { ...SUB, keys: { ...SUB.keys, auth: "a".repeat(65) } } }],
    ["titre vide", { titre: "  " }],
    ["titre trop long", { titre: "x".repeat(101) }],
    ["corps trop long", { corps: "x".repeat(301) }],
    ["url vers un autre site", { url: "//evil.example.com" }],
    ["url absolue", { url: "https://evil.example.com/" }],
    ["enclos hors limites", { enclos: 6 }],
    ["at non entier", { at: 1.5 }],
    ["at manquant", { at: undefined }],
  ])("refuse : %s", (_, patch) => {
    expect(demandeRappelSchema.safeParse(demande(patch)).success).toBe(false);
  });

  it("services push des principaux navigateurs", () => {
    for (const u of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ])
      expect(serviceAutorise(u)).toBe(true);
    expect(serviceAutorise("pas une url")).toBe(false);
  });

  it("heure : future et à moins de 7 jours", () => {
    expect(erreurHeure(T0 - 1, T0)).toMatch(/passée/);
    expect(erreurHeure(T0, T0)).toMatch(/passée/);
    expect(erreurHeure(T0 + MAX_DELAI_MS + 1, T0)).toMatch(/7 jours/);
    expect(erreurHeure(T0 + MAX_DELAI_MS, T0)).toBeNull();
  });
});

/* ---------- planification (client QStash simulé) ---------- */
function fausseFile(over: { publier?: FileQStash["publier"]; lire?: FileQStash["lire"] } = {}) {
  return {
    publier: vi.fn<FileQStash["publier"]>(over.publier ?? (async () => ({ messageId: "msg_test_1" }))),
    lire: vi.fn<FileQStash["lire"]>(over.lire ?? (async () => null)),
    annuler: vi.fn<FileQStash["annuler"]>(async () => {}),
  };
}

describe("construction et publication du message QStash", () => {
  it("message : subscription + notification, notBefore en secondes", async () => {
    const file = fausseFile();
    const d = demandeRappelSchema.parse(demande({ at: T0 + 30 * 60_000 + 400 }));
    const r = await planifierRappel(d, { file, urlDeclenchement: URL_FIRE, maintenantMs: T0 });
    expect(r).toEqual({ ok: true, messageId: "msg_test_1", at: d.at });
    expect(file.publier).toHaveBeenCalledOnce();
    const req = file.publier.mock.calls[0][0];
    expect(req.url).toBe(URL_FIRE);
    expect(req.notBefore).toBe(Math.ceil(d.at / 1000));
    expect(req.notBefore * 1000).toBeGreaterThanOrEqual(d.at); // jamais en avance
    expect(req.corps).toEqual({
      v: 1,
      subscription: SUB,
      notification: { titre: d.titre, corps: d.corps, url: "/enclos#enclos-1", tag: "enclos-1" },
      at: d.at,
    });
    expect(messageRappelSchema.safeParse(JSON.parse(JSON.stringify(req.corps))).success).toBe(true);
    expect(req.retries).toBeGreaterThan(0);
  });

  it("refuse une heure passée sans appeler QStash", async () => {
    const file = fausseFile();
    const r = await planifierRappel(demandeRappelSchema.parse(demande({ at: T0 - 1000 })), {
      file,
      urlDeclenchement: URL_FIRE,
      maintenantMs: T0,
    });
    expect(r).toMatchObject({ ok: false, statut: 400 });
    expect(file.publier).not.toHaveBeenCalled();
  });

  it("limite de messages par subscription", async () => {
    const file = fausseFile();
    const limite = new LimiteDebit(3, 3600_000);
    const d = demandeRappelSchema.parse(demande());
    const deps = { file, urlDeclenchement: URL_FIRE, maintenantMs: T0, limite };
    for (let i = 0; i < 3; i++) expect((await planifierRappel(d, deps)).ok).toBe(true);
    expect(await planifierRappel(d, deps)).toMatchObject({ ok: false, statut: 429 });
    /* une autre subscription n'est pas concernée ; la fenêtre finit par passer */
    const autre = { ...d, subscription: { ...SUB, endpoint: `${SUB.endpoint}-2` } };
    expect((await planifierRappel(autre, deps)).ok).toBe(true);
    const plusTard = T0 + 3600_001;
    expect((await planifierRappel({ ...d, at: plusTard + 60_000 }, { ...deps, maintenantMs: plusTard })).ok).toBe(true);
  });

  it("QStash en panne : 502 propre", async () => {
    const file = fausseFile({ publier: async () => Promise.reject(new Error("boom")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await planifierRappel(demandeRappelSchema.parse(demande()), { file, urlDeclenchement: URL_FIRE, maintenantMs: T0 });
    expect(r).toMatchObject({ ok: false, statut: 502 });
  });
});

describe("annulation", () => {
  const corps = JSON.stringify(construireMessage(demandeRappelSchema.parse(demande())));
  const deps = (lire: FileQStash["lire"]) => {
    const file = fausseFile({ lire });
    return { file, urlDeclenchement: URL_FIRE };
  };

  it("annule le message de la même subscription", async () => {
    const d = deps(async () => ({ url: URL_FIRE, body: corps }));
    expect(await annulerRappel("msg_1", SUB.endpoint, d)).toEqual({ ok: true, annule: true });
    expect(d.file.annuler).toHaveBeenCalledWith("msg_1");
  });

  it("refuse si la subscription ne correspond pas, ou si ce n'est pas un rappel", async () => {
    const d = deps(async () => ({ url: URL_FIRE, body: corps }));
    expect(await annulerRappel("msg_1", "https://fcm.googleapis.com/autre", d)).toMatchObject({ ok: false, statut: 403 });
    const d2 = deps(async () => ({ url: "https://ailleurs.example.com/hook", body: corps }));
    expect(await annulerRappel("msg_1", SUB.endpoint, d2)).toMatchObject({ ok: false, statut: 403 });
    expect(d.file.annuler).not.toHaveBeenCalled();
    expect(d2.file.annuler).not.toHaveBeenCalled();
  });

  it("message déjà livré ou inconnu : rien à faire", async () => {
    const d = deps(async () => null);
    expect(await annulerRappel("msg_1", SUB.endpoint, d)).toEqual({ ok: true, annule: false });
  });
});

/* ---------- signature QStash (vrai Receiver, clés de test) ---------- */
describe("vérification de signature", () => {
  const receiver = new Receiver({ currentSigningKey: CLE_TEST_COURANTE, nextSigningKey: CLE_TEST_SUIVANTE, devMode: false });
  const corps = JSON.stringify(construireMessage(demandeRappelSchema.parse(demande())));
  const ok = (signature: string | null, c = corps, url = URL_FIRE) => signatureValide(receiver, { signature, corps: c, url });

  it("accepte une signature valide (clé courante ou suivante)", async () => {
    expect(await ok(signer(CLE_TEST_COURANTE, corps, URL_FIRE))).toBe(true);
    expect(await ok(signer(CLE_TEST_SUIVANTE, corps, URL_FIRE))).toBe(true);
  });

  it("refuse : absente, mauvaise clé, corps modifié, autre URL, expirée, n'importe quoi", async () => {
    expect(await ok(null)).toBe(false);
    expect(await ok("")).toBe(false);
    expect(await ok(signer("une_autre_cle", corps, URL_FIRE))).toBe(false);
    expect(await ok(signer(CLE_TEST_COURANTE, corps, URL_FIRE), corps.replace("21 h 40", "22 h 00"))).toBe(false);
    expect(await ok(signer(CLE_TEST_COURANTE, corps, "https://ailleurs.example.com/api/reminders/fire"))).toBe(false);
    const ancien = Math.floor(Date.now() / 1000) - 3600;
    expect(await ok(signer(CLE_TEST_COURANTE, corps, URL_FIRE, { maintenantS: ancien }))).toBe(false);
    expect(await ok("abc.def.ghi")).toBe(false);
  });

  it("anti-rejeu : une signature n'est acceptée qu'une fois (sauf échec temporaire)", () => {
    const a = new AntiRejeu(1000);
    expect(a.premiereFois("s1", 0)).toBe(true);
    expect(a.premiereFois("s1", 10)).toBe(false);
    a.oublier("s1");
    expect(a.premiereFois("s1", 20)).toBe(true);
    expect(a.premiereFois("s1", 2000)).toBe(true); // expirée, purgée
  });
});

/* ---------- envoi web-push simulé ---------- */
describe("envoi de la notification", () => {
  const vapid = { subject: "https://dragodindes-elevage.vercel.app", publicKey: "pub", privateKey: "priv" };
  const message = construireMessage(demandeRappelSchema.parse(demande()));
  const erreurPush = (statusCode: number) => Object.assign(new Error(`push ${statusCode}`), { statusCode });

  it("envoie le payload attendu par le service worker", async () => {
    const envoyer = vi.fn(async () => ({ statusCode: 201 }));
    expect(await envoyerRappel(message, { envoyer, vapid })).toEqual({ etat: "envoye" });
    const [sub, payload, options] = envoyer.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(sub).toEqual(SUB);
    expect(JSON.parse(payload)).toEqual({ titre: message.notification.titre, corps: message.notification.corps, url: "/enclos#enclos-1", tag: "enclos-1" });
    expect(options).toMatchObject({ urgency: "high", topic: "enclos-1", vapidDetails: vapid });
    expect(options.TTL).toBeGreaterThan(0);
  });

  it.each([
    [410, "expire"],
    [404, "expire"],
    [429, "reessayer"],
    [503, "reessayer"],
    [400, "echec"],
    [403, "echec"],
  ])("statut %i → %s", async (code, etat) => {
    const envoyer = vi.fn(async () => Promise.reject(erreurPush(code)));
    expect(await envoyerRappel(message, { envoyer, vapid })).toEqual({ etat, statut: code });
  });

  it("erreur réseau → réessayer", async () => {
    const envoyer = vi.fn(async () => Promise.reject(new Error("ECONNRESET")));
    expect(await envoyerRappel(message, { envoyer, vapid })).toEqual({ etat: "reessayer", statut: undefined });
  });
});

/* ---------- configuration ---------- */
describe("configuration par variables d'environnement", () => {
  const complet = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
    VAPID_PRIVATE_KEY: "priv",
    VAPID_SUBJECT: "https://dragodindes-elevage.vercel.app",
    QSTASH_TOKEN: "tok",
    QSTASH_CURRENT_SIGNING_KEY: "a",
    QSTASH_NEXT_SIGNING_KEY: "b",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "dragodindes-elevage.vercel.app",
    VERCEL_URL: "dragodindes-elevage-abc.vercel.app",
  };

  it("désactivé proprement si rien n'est configuré", () => {
    const c = configPush({});
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.manque).toContain("QSTASH_TOKEN");
  });

  it("une seule variable manquante suffit à désactiver", () => {
    const c = configPush({ ...complet, QSTASH_NEXT_SIGNING_KEY: " " });
    expect(c).toEqual({ ok: false, manque: ["QSTASH_NEXT_SIGNING_KEY"] });
  });

  it("URL de déclenchement : domaine de production, sinon déploiement, sinon APP_URL", () => {
    const c = configPush(complet);
    expect(c.ok && c.config.urlDeclenchement).toBe(URL_FIRE);
    expect(originePublique({ ...complet, VERCEL_ENV: "preview" })).toBe("https://dragodindes-elevage-abc.vercel.app");
    expect(originePublique({ ...complet, APP_URL: "http://localhost:3000/" })).toBe("http://localhost:3000");
  });
});

/* ---------- client ---------- */
describe("détection côté navigateur", () => {
  const android: Plateforme = { ios: false, standalone: false, pushApi: true };
  const base = { cleVapid: "pub", serveur: { disponible: true } as const, plateforme: android, permission: "default" as const };

  it("raison d'indisponibilité, par priorité", () => {
    expect(raisonIndispo(base)).toBeNull();
    expect(raisonIndispo({ ...base, cleVapid: undefined })).toBe("serveur");
    expect(raisonIndispo({ ...base, serveur: { disponible: false, raison: "x" } })).toBe("serveur");
    expect(raisonIndispo({ ...base, serveur: "injoignable" })).toBe("hors-ligne");
    expect(raisonIndispo({ ...base, plateforme: { ios: true, standalone: false, pushApi: false } })).toBe("ios-installer");
    expect(raisonIndispo({ ...base, plateforme: { ios: true, standalone: true, pushApi: true } })).toBeNull();
    expect(raisonIndispo({ ...base, plateforme: { ios: true, standalone: true, pushApi: false } })).toBe("navigateur");
    expect(raisonIndispo({ ...base, permission: "denied" })).toBe("refuse");
  });

  it("clé VAPID base64url → octets", () => {
    expect([...cleVersOctets("AQID_w")]).toEqual([1, 2, 3, 255]);
  });
});

describe("contenu du rappel d'un enclos", () => {
  const enclos = enclosSchema.parse({
    nom: "Nord",
    montures: [{ serenite: -3000 }],
    jaugeSerenite: "+",
    niveauSerenite: 200000,
    saisieLe: T0,
  });

  it("heure = retour moins la marge, texte et lien vers l'enclos", () => {
    const c = contenuRappel(enclos, 2, "aucun", T0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.at).toBeGreaterThan(T0);
    expect(c.titre).toContain("Nord");
    expect(c.url).toBe("/enclos#enclos-3");
    expect(c.enclos).toBe(2);
    expect(demandeRappelSchema.safeParse({ ...c, subscription: SUB }).success).toBe(true);
  });

  it("pas de rappel sans jauge active, ni si le retour est imminent", () => {
    expect(contenuRappel(enclosSchema.parse({ nom: "Vide" }), 0, "aucun", T0).ok).toBe(false);
    const c = contenuRappel(enclos, 0, "aucun", T0);
    if (c.ok) expect(contenuRappel(enclos, 0, "aucun", c.at - 30_000).ok).toBe(false);
  });
});
