"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detecterPlateforme,
  enregistrementSw,
  etatServeur,
  raisonIndispo,
  sAbonner,
  type RaisonIndispo,
} from "@/lib/push/client";

/* Clé publique VAPID, intégrée au build (absente en local et dans les tests : push désactivé). */
const CLE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type EtatPush =
  | { statut: "chargement" }
  | { statut: "indisponible"; raison: RaisonIndispo }
  /** Possible sur cet appareil ; `abonne` : déjà autorisé et abonné. */
  | { statut: "pret"; abonne: boolean };

export interface Push {
  etat: EtatPush;
  /** Subscription de cet appareil, si abonné. */
  subscription: PushSubscription | null;
  /** Demande la permission et s'abonne (geste de l'utilisateur requis). */
  activer: () => Promise<PushSubscription | null>;
}

export function usePush(): Push {
  const [etat, setEtat] = useState<EtatPush>({ statut: "chargement" });
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const reg = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const plateforme = detecterPlateforme();
      const serveur = CLE_VAPID ? await etatServeur() : ({ disponible: false, raison: "" } as const);
      const permission = typeof Notification === "undefined" ? undefined : Notification.permission;
      const raison = raisonIndispo({ cleVapid: CLE_VAPID, serveur, plateforme, permission });
      if (annule) return;
      if (raison) return setEtat({ statut: "indisponible", raison });
      const r = await enregistrementSw();
      if (annule) return;
      if (!r) return setEtat({ statut: "indisponible", raison: "sw" });
      reg.current = r;
      const sub = permission === "granted" ? await r.pushManager.getSubscription().catch(() => null) : null;
      if (annule) return;
      setSubscription(sub);
      setEtat({ statut: "pret", abonne: sub !== null });
    })();
    return () => {
      annule = true;
    };
  }, []);

  const activer = useCallback(async () => {
    if (!reg.current || !CLE_VAPID) return null;
    const r = await sAbonner(reg.current, CLE_VAPID);
    if (!r.ok) {
      setEtat({ statut: "indisponible", raison: r.raison });
      return null;
    }
    setSubscription(r.subscription);
    setEtat({ statut: "pret", abonne: true });
    return r.subscription;
  }, []);

  return { etat, subscription, activer };
}
