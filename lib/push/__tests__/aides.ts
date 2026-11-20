/* Aides de test : fausse subscription et signature QStash (JWT HS256) avec des clés de TEST. */
import { createHash, createHmac, randomUUID } from "node:crypto";

export const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

export const CLE_TEST_COURANTE = "sig_test_courante_1234567890";
export const CLE_TEST_SUIVANTE = "sig_test_suivante_0987654321";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Signe comme QStash : JWT HS256 { iss: "Upstash", sub: url, body: sha256(corps) en base64url }. */
export function signer(
  cle: string,
  corps: string,
  url: string,
  opts: { maintenantS?: number; dureeS?: number } = {},
): string {
  const now = opts.maintenantS ?? Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const charge = b64url(
    JSON.stringify({
      iss: "Upstash",
      sub: url,
      exp: now + (opts.dureeS ?? 300),
      nbf: now,
      iat: now,
      jti: randomUUID(),
      body: createHash("sha256").update(corps).digest("base64url"),
    }),
  );
  const sig = createHmac("sha256", cle).update(`${entete}.${charge}`).digest("base64url");
  return `${entete}.${charge}.${sig}`;
}
