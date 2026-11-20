/* Bout en bout des Route Handlers, sans réseau : QStash (publication) et web-push sont simulés,
   le rappel est « livré » par un appel signé avec des clés de TEST, comme le ferait QStash. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLE_TEST_COURANTE, CLE_TEST_SUIVANTE, SUB, signer } from "./__tests__/aides";

const envoyes: { sub: unknown; payload: string; options: Record<string, unknown> }[] = [];
let reponsePush: () => Promise<unknown> = async () => ({ statusCode: 201 });
vi.mock("web-push", () => ({
  sendNotification: vi.fn(async (sub: unknown, payload: string, options: Record<string, unknown>) => {
    envoyes.push({ sub, payload, options });
    return reponsePush();
  }),
}));

const publies: Record<string, unknown>[] = [];
const messages = new Map<string, { url: string; body: string }>();
const annules: string[] = [];
vi.mock("@upstash/qstash", async (orig) => {
  const vrai = await orig<typeof import("@upstash/qstash")>();
  class Client {
    constructor(readonly cfg: { token: string }) {}
    async publishJSON(req: { url: string; body: unknown }) {
      publies.push(req as Record<string, unknown>);
      const id = `msg_${publies.length}`;
      messages.set(id, { url: req.url, body: JSON.stringify(req.body) });
      return { messageId: id, url: req.url };
    }
    messages = {
      get: async (id: string) => {
        const m = messages.get(id);
        if (!m) throw new vrai.QstashError("not found", 404);
        return m;
      },
      cancel: async (id: string) => {
        annules.push(id);
        messages.delete(id);
        return { cancelled: 1 };
      },
    };
  }
  return { ...vrai, Client };
});

const { GET, POST } = await import("../../app/api/reminders/route");
const { DELETE } = await import("../../app/api/reminders/[id]/route");
const { POST: FIRE } = await import("../../app/api/reminders/fire/route");

const ORIGINE = "https://dragodindes-elevage.vercel.app";
const ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPubliqueDeTest",
  VAPID_PRIVATE_KEY: "PriveeDeTest",
  VAPID_SUBJECT: ORIGINE,
  QSTASH_TOKEN: "jeton-de-test",
  QSTASH_CURRENT_SIGNING_KEY: CLE_TEST_COURANTE,
  QSTASH_NEXT_SIGNING_KEY: CLE_TEST_SUIVANTE,
  APP_URL: ORIGINE,
};
const configurer = () => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
};

const post = (url: string, corps: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
const demande = () => ({
  subscription: SUB,
  at: Date.now() + 20 * 60_000,
  titre: "Enclos 2 : reviens à l’enclos",
  corps: "Reviens avant 21 h 40.",
  url: "/enclos#enclos-2",
  enclos: 1,
});

beforeEach(() => {
  envoyes.length = 0;
  publies.length = 0;
  annules.length = 0;
  messages.clear();
  reponsePush = async () => ({ statusCode: 201 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("variables absentes : fonctionnalité désactivée proprement", () => {
  beforeEach(() => {
    for (const k of Object.keys(ENV)) vi.stubEnv(k, "");
  });

  it("GET indique l'indisponibilité, sans planter", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ disponible: false });
  });

  it("POST, DELETE et fire répondent 503", async () => {
    expect((await POST(post("http://x/api/reminders", demande()))).status).toBe(503);
    const del = new Request("http://x/api/reminders/msg_1", { method: "DELETE", body: "{}" });
    expect((await DELETE(del, { params: Promise.resolve({ id: "msg_1" }) })).status).toBe(503);
    expect((await FIRE(post("http://x/api/reminders/fire", "{}"))).status).toBe(503);
  });
});

describe("flux complet simulé", () => {
  beforeEach(configurer);

  it("GET : disponible, et aucune clé n'est renvoyée", async () => {
    const r = await GET();
    const texte = await r.text();
    expect(JSON.parse(texte)).toEqual({ disponible: true });
    for (const v of Object.values(ENV)) if (v !== ORIGINE) expect(texte).not.toContain(v);
  });

  it("planifie → QStash appelle fire avec une signature valide → la notification part", async () => {
    const r = await POST(post(`${ORIGINE}/api/reminders`, demande()));
    expect(r.status).toBe(201);
    const { messageId } = await r.json();
    expect(messageId).toBe("msg_1");
    expect(publies[0].url).toBe(`${ORIGINE}/api/reminders/fire`);
    expect(typeof publies[0].notBefore).toBe("number");

    /* QStash livre le message : même corps, signé pour l'URL de publication. */
    const corps = messages.get("msg_1")!.body;
    const fire = await FIRE(
      post(`http://127.0.0.1:3000/api/reminders/fire`, corps, { "upstash-signature": signer(CLE_TEST_COURANTE, corps, `${ORIGINE}/api/reminders/fire`) }),
    );
    expect(fire.status).toBe(200);
    expect(await fire.json()).toEqual({ envoye: true });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].sub).toEqual(SUB);
    expect(JSON.parse(envoyes[0].payload)).toMatchObject({ url: "/enclos#enclos-2", tag: "enclos-2" });
    expect(envoyes[0].options.vapidDetails).toEqual({ subject: ORIGINE, publicKey: ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: ENV.VAPID_PRIVATE_KEY });
  });

  it("fire REFUSE tout appel sans signature valide (aucun envoi)", async () => {
    const corps = JSON.stringify({ v: 1, subscription: SUB, notification: { titre: "x", corps: "", url: "/enclos" }, at: Date.now() });
    const url = `${ORIGINE}/api/reminders/fire`;
    for (const headers of [
      {} as Record<string, string>,
      { "upstash-signature": "n.importe.quoi" },
      { "upstash-signature": signer("cle_pirate", corps, url) },
      { "upstash-signature": signer(CLE_TEST_COURANTE, corps, "https://autre.example.com/api/reminders/fire") },
      { "upstash-signature": signer(CLE_TEST_COURANTE, `${corps} `, url) },
    ]) {
      const r = await FIRE(post(url, corps, headers));
      expect(r.status).toBe(401);
    }
    expect(envoyes).toHaveLength(0);
  });

  it("subscription expirée (410) : 200 pour que QStash n'insiste pas", async () => {
    reponsePush = async () => Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const corps = JSON.stringify({ v: 1, subscription: SUB, notification: { titre: "x", corps: "", url: "/enclos" }, at: Date.now() });
    const url = `${ORIGINE}/api/reminders/fire`;
    const r = await FIRE(post(url, corps, { "upstash-signature": signer(CLE_TEST_SUIVANTE, corps, url) }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ envoye: false, statut: 410 });
  });

  it("service push en panne (503) : 503 pour que QStash réessaie, puis la nouvelle tentative passe", async () => {
    reponsePush = async () => Promise.reject(Object.assign(new Error("Unavailable"), { statusCode: 503 }));
    const corps = JSON.stringify({ v: 1, subscription: SUB, notification: { titre: "x", corps: "", url: "/enclos" }, at: Date.now() });
    const url = `${ORIGINE}/api/reminders/fire`;
    const sig = signer(CLE_TEST_COURANTE, corps, url);
    expect((await FIRE(post(url, corps, { "upstash-signature": sig }))).status).toBe(503);
    reponsePush = async () => ({ statusCode: 201 });
    expect((await FIRE(post(url, corps, { "upstash-signature": sig }))).status).toBe(200);
    /* rejeu de la même signature après succès : ignoré */
    expect(await (await FIRE(post(url, corps, { "upstash-signature": sig }))).json()).toMatchObject({ ignore: expect.any(String) });
    expect(envoyes).toHaveLength(2);
  });

  it("POST : corps invalide, trop gros ou JSON cassé", async () => {
    expect((await POST(post("http://x/api/reminders", { ...demande(), at: Date.now() - 1000 }))).status).toBe(400);
    expect((await POST(post("http://x/api/reminders", { ...demande(), subscription: { ...SUB, endpoint: "https://evil.example.com/" } }))).status).toBe(400);
    expect((await POST(post("http://x/api/reminders", "{pas du json"))).status).toBe(400);
    expect((await POST(post("http://x/api/reminders", { ...demande(), corps: "x".repeat(9000) }))).status).toBe(413);
    expect(publies).toHaveLength(0);
  });

  it("DELETE : annule seulement avec la bonne subscription", async () => {
    await POST(post(`${ORIGINE}/api/reminders`, demande()));
    const del = (endpoint: string, id = "msg_1") =>
      DELETE(new Request(`http://x/api/reminders/${id}`, { method: "DELETE", body: JSON.stringify({ endpoint }) }), {
        params: Promise.resolve({ id }),
      });
    expect((await del("https://fcm.googleapis.com/fcm/send/autre")).status).toBe(403);
    expect(annules).toEqual([]);
    const ok = await del(SUB.endpoint);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ annule: true });
    expect(annules).toEqual(["msg_1"]);
    /* déjà annulé : rien à faire */
    expect(await (await del(SUB.endpoint)).json()).toEqual({ annule: false });
    expect((await del(SUB.endpoint, "../../etc")).status).toBe(400);
  });
});
