/* =====================================================================
   push/qstash.ts — branchement réel sur @upstash/qstash (serveur uniquement)
   ===================================================================== */

import { Client, QstashError, Receiver } from "@upstash/qstash";
import { MAX_CORPS_OCTETS } from "./schema";
import type { FileQStash, VerifieurSignature } from "./server";

export function fileQStash(token: string, baseUrl?: string): FileQStash {
  const client = new Client({ token, baseUrl });
  return {
    publier: async ({ url, corps, notBefore, retries, label }) => {
      const r = await client.publishJSON({ url, body: corps, notBefore, retries, label });
      return { messageId: r.messageId };
    },
    lire: async (id) => {
      try {
        const m = await client.messages.get(id);
        return { url: m.url, body: m.body };
      } catch (e) {
        if (e instanceof QstashError && e.status === 404) return null;
        throw e;
      }
    },
    annuler: async (id) => {
      try {
        await client.messages.cancel(id);
      } catch (e) {
        if (e instanceof QstashError && e.status === 404) return; // déjà livré entre-temps
        throw e;
      }
    },
  };
}

/** `devMode: false` : jamais les clés du serveur de dev local, même si QSTASH_DEV traîne. */
export const verifieurQStash = (keys: { current: string; next: string }): VerifieurSignature =>
  new Receiver({ currentSigningKey: keys.current, nextSigningKey: keys.next, devMode: false });

/** Lit le corps brut en refusant tout ce qui dépasse la limite. null si trop gros. */
export async function lireCorps(req: Request, max = MAX_CORPS_OCTETS): Promise<string | null> {
  const annonce = Number(req.headers.get("content-length") ?? "0");
  if (annonce > max) return null;
  const texte = await req.text();
  return new TextEncoder().encode(texte).length > max ? null : texte;
}

export function json(corps: unknown, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "Cache-Control": "no-store" } });
}
