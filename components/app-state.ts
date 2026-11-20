"use client";

/* État d'interface partagé entre les pages (#4) : hydratation du vrai magasin et mode démo.
   Jamais persisté : recharger la page quitte toujours la démo. */
import { useEffect } from "react";
import { create } from "zustand";
import { resetDemo, syncOnglets, useDemoStore, useStore, type AppStore } from "@/lib/store";

interface Ui {
  /* Vrai une fois le localStorage relu (le magasin est créé avec skipHydration). */
  pret: boolean;
  demo: boolean;
  setDemo: (demo: boolean) => void;
}

export const useUi = create<Ui>()((set) => ({
  pret: false,
  demo: false,
  setDemo: (demo) => {
    /* Chaque entrée en démo repart des mêmes données fictives. */
    if (demo) resetDemo();
    set({ demo });
  },
}));

/* À appeler une fois (AppShell) : lit le localStorage côté client. */
export function useHydratation() {
  useEffect(() => {
    const fin = useStore.persist.onFinishHydration(() => useUi.setState({ pret: true }));
    void useStore.persist.rehydrate();
    if (useStore.persist.hasHydrated()) useUi.setState({ pret: true });
    const finSync = syncOnglets();
    return () => {
      fin();
      finSync();
    };
  }, []);
}

/* Lit le magasin actif : le vrai, ou celui de la démo (en mémoire, isolé des vraies données). */
export function useApp<T>(selecteur: (s: AppStore) => T): T {
  const demo = useUi((u) => u.demo);
  const vrai = useStore(selecteur);
  const fictif = useDemoStore(selecteur);
  return demo ? fictif : vrai;
}

/* Accès impératif au magasin actif (dans les gestionnaires d'événements). */
export const magasinActif = () => (useUi.getState().demo ? useDemoStore : useStore);
