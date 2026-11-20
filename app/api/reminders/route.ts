/* GET  /api/reminders : le push est-il configuré sur ce serveur ? (aucun secret renvoyé)
   POST /api/reminders : planifie un rappel push via QStash (#16). */

import { configPush } from "@/lib/push/config";
import { fileQStash, json, lireCorps } from "@/lib/push/qstash";
import { demandeRappelSchema, type EtatServeurPush } from "@/lib/push/schema";
import { LimiteDebit, planifierRappel } from "@/lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Protection minimale contre les abus, par instance : 30 rappels / heure / appareil, 120 / heure / IP. */
const parAppareil = new LimiteDebit(30, 3600_000);
const parIp = new LimiteDebit(120, 3600_000);

const NON_CONFIGURE = "Les notifications push ne sont pas encore configurées sur ce serveur.";

export function GET() {
  const c = configPush(process.env);
  const etat: EtatServeurPush = c.ok ? { disponible: true } : { disponible: false, raison: NON_CONFIGURE };
  return json(etat);
}

export async function POST(req: Request) {
  const c = configPush(process.env);
  if (!c.ok) return json({ erreur: NON_CONFIGURE }, 503);

  const texte = await lireCorps(req);
  if (texte === null) return json({ erreur: "Requête trop volumineuse." }, 413);
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return json({ erreur: "JSON invalide." }, 400);
  }
  const d = demandeRappelSchema.safeParse(brut);
  if (!d.success) return json({ erreur: "Demande invalide.", details: d.error.issues.map((i) => i.message) }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const maintenant = Date.now();
  if (!parIp.accepter(ip, maintenant)) return json({ erreur: "Trop de demandes : réessaie plus tard." }, 429);

  const r = await planifierRappel(d.data, {
    file: fileQStash(c.config.qstashToken, c.config.qstashUrl),
    urlDeclenchement: c.config.urlDeclenchement,
    maintenantMs: maintenant,
    limite: parAppareil,
  });
  return r.ok ? json({ messageId: r.messageId, at: r.at }, 201) : json({ erreur: r.erreur }, r.statut);
}
