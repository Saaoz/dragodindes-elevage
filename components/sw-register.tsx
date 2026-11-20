"use client";

import { useEffect } from "react";

/** Enregistre le service worker, en production uniquement, et cherche une nouvelle version au retour sur l'appli. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => (reg = r))
      .catch((err) => {
        console.error("Échec de l'enregistrement du service worker", err);
      });
    // Une PWA reste parfois ouverte des jours : on redemande sw.js (le navigateur compare les octets, #55).
    const verifier = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", verifier);
    return () => document.removeEventListener("visibilitychange", verifier);
  }, []);
  return null;
}
