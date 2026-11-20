"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EnclosCard } from "@/components/enclos/enclos-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatCompteARebours, remplacerEnclos, trierParUrgence, vueEnclos, type Objectif } from "@/lib/enclos";
import { enclosSchema, NB_ENCLOS, type Enclos } from "@/lib/schema";
import { useStore } from "@/lib/store";

const TITRE = "Mes enclos";

export function EnclosPanel() {
  const [pret, setPret] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [objectifs, setObjectifs] = useState<Objectif[]>(() => Array(NB_ENCLOS).fill("aucun"));
  const enclos = useStore((s) => s.enclos);

  /* Le magasin n'est pas hydraté tout seul (skipHydration) : lecture du localStorage côté client. */
  useEffect(() => {
    const fin = useStore.persist.onFinishHydration(() => setPret(true));
    void useStore.persist.rehydrate();
    if (useStore.persist.hasHydrated()) setPret(true); // eslint-disable-line react-hooks/set-state-in-effect
    return fin;
  }, []);

  /* Horloge : on recalcule chaque seconde. */
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const vues = useMemo(
    () => trierParUrgence(enclos.map((e, i) => vueEnclos(e, i, maintenant, objectifs[i] ?? "aucun"))),
    [enclos, maintenant, objectifs],
  );

  /* Titre de l'onglet = compte à rebours du prochain événement. */
  const prochain = vues[0]?.retour ?? null;
  useEffect(() => {
    if (!pret) return;
    document.title = prochain
      ? `${formatCompteARebours((prochain.quandMs - maintenant) / 1000)} · ${enclos[vues[0].index].nom || `Enclos ${vues[0].index + 1}`} · ${TITRE}`
      : TITRE;
  }, [pret, prochain, maintenant, enclos, vues]);
  useEffect(() => () => void (document.title = "Élevage de dragodindes"), []);

  const sauver = (i: number, e: Enclos) => {
    const r = enclosSchema.safeParse(e);
    if (r.success) useStore.setState({ enclos: remplacerEnclos(useStore.getState().enclos, i, r.data) });
  };
  const vider = (i: number) =>
    sauver(i, enclosSchema.parse({ nom: enclos[i].nom }));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
            ← Accueil
          </Link>
          <h1 className="text-2xl font-bold">Mes enclos</h1>
        </div>
        <ThemeToggle />
      </header>
      <p className="text-sm text-muted-foreground">
        En quittant un enclos, note la sérénité de chaque monture et le niveau des jauges : l&apos;outil te dit à
        quelle heure revenir. Les 6 enclos sont triés, le plus urgent en haut. Tout reste dans ce navigateur.
      </p>
      {!pret ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {vues.map((v, rang) => (
            <EnclosCard
              key={v.index}
              enclos={enclos[v.index]}
              vue={v}
              maintenantMs={maintenant}
              premier={rang === 0}
              objectif={objectifs[v.index] ?? "aucun"}
              onObjectif={(o) => setObjectifs((p) => p.map((x, k) => (k === v.index ? o : x)))}
              onSave={(e) => sauver(v.index, e)}
              onClear={() => vider(v.index)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
