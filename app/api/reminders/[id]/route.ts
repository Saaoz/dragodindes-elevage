/* DELETE /api/reminders/:id — annule un rappel planifié (#16).
   Corps : { endpoint } ; le message n'est annulé que s'il vise cette même subscription. */

import { configPush } from "@/lib/push/config";
import { fileQStash, json, lireCorps } from "@/lib/push/qstash";
import { annulationSchema, idMessageSchema } from "@/lib/push/schema";
import { annulerRappel } from "@/lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = configPush(process.env);
  if (!c.ok) return json({ erreur: "Les notifications push ne sont pas encore configurées sur ce serveur." }, 503);

  const id = idMessageSchema.safeParse((await ctx.params).id);
  if (!id.success) return json({ erreur: "Identifiant invalide." }, 400);
  const texte = await lireCorps(req);
  if (texte === null) return json({ erreur: "Requête trop volumineuse." }, 413);
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return json({ erreur: "JSON invalide." }, 400);
  }
  const a = annulationSchema.safeParse(brut);
  if (!a.success) return json({ erreur: "Demande invalide." }, 400);

  const r = await annulerRappel(id.data, a.data.endpoint, {
    file: fileQStash(c.config.qstashToken, c.config.qstashUrl),
    urlDeclenchement: c.config.urlDeclenchement,
  });
  return r.ok ? json({ annule: r.annule }) : json({ erreur: r.erreur }, r.statut);
}
