"use client";

import { useEffect } from "react";

/** Enregistre le service worker, en production uniquement. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("Échec de l'enregistrement du service worker", err);
    });
  }, []);
  return null;
}
