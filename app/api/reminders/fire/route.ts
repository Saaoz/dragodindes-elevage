/* POST /api/reminders/fire — appelé par QStash à l'heure prévue (#16).
   Refuse tout appel sans signature QStash valide, puis envoie la notification avec web-push. */

import { sendNotification } from "web-push";
import { CHEMIN_DECLENCHEMENT, configSignature, configVapid, originePublique } from "@/lib/push/config";
import { json, lireCorps, verifieurQStash } from "@/lib/push/qstash";
import { messageRappelSchema } from "@/lib/push/schema";
import { AntiRejeu, envoyerRappel, signatureValide } from "@/lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const antiRejeu = new AntiRejeu();

export async function POST(req: Request) {
  const sig = configSignature(process.env);
  const vapid = configVapid(process.env);
  const origine = originePublique(process.env);
  if (!sig.ok || !vapid.ok || !origine) return json({ erreur: "Push non configuré." }, 503);

  const texte = await lireCorps(req);
  if (texte === null) return json({ erreur: "Requête trop volumineuse." }, 413);

  /* L'URL vérifiée est celle À LAQUELLE le message a été publié, jamais req.url (proxy Vercel). */
  const signature = req.headers.get("upstash-signature");
  const ok = await signatureValide(verifieurQStash(sig.config), {
    signature,
    corps: texte,
    url: `${origine}${CHEMIN_DECLENCHEMENT}`,
  });
  if (!ok) return json({ erreur: "Signature QStash absente ou invalide." }, 401);
  if (!antiRejeu.premiereFois(signature!, Date.now())) return json({ ignore: "déjà traité" });

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    brut = null;
  }
  const m = messageRappelSchema.safeParse(brut);
  /* Signé mais illisible : 200 pour que QStash n'insiste pas inutilement. */
  if (!m.success) return json({ ignore: "message invalide" });

  const r = await envoyerRappel(m.data, { envoyer: sendNotification, vapid: vapid.config });
  switch (r.etat) {
    case "envoye":
      return json({ envoye: true });
    case "expire":
      /* Subscription expirée / révoquée : rien n'est stocké côté serveur, il n'y a rien à nettoyer. */
      return json({ envoye: false, raison: "subscription expirée", statut: r.statut });
    case "reessayer":
      antiRejeu.oublier(signature!);
      return json({ erreur: "Service push indisponible, nouvel essai.", statut: r.statut }, 503);
    case "echec":
      console.error("web-push : échec définitif", r.statut);
      return json({ envoye: false, raison: "refusé par le service push", statut: r.statut });
  }
}
