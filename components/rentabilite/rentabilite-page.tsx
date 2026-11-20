"use client";

import { useEffect, useState } from "react";
import { Calculator, ChartColumn, Tags } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { magasinActif, useApp, useUi } from "@/components/app-state";
import { BoutonDemo } from "@/components/commun/bouton-demo";
import { champ } from "@/components/commun/champ";
import { EnTete, Page } from "@/components/commun/en-tete";
import { Comparatif } from "@/components/rentabilite/comparatif";
import { PrixHdv } from "@/components/rentabilite/prix-hdv";
import { Simulateur } from "@/components/rentabilite/simulateur";
import { SERVEURS } from "@/lib/data";
import { oldestAge, priceCount } from "@/lib/store";
import { cn } from "@/lib/utils";

const ONGLETS = [
  { id: "simuler", label: "Simuler", icone: Calculator },
  { id: "prix", label: "Mes prix", icone: Tags },
  { id: "comparer", label: "Comparer", icone: ChartColumn },
] as const;
type Onglet = (typeof ONGLETS)[number]["id"];
const estOnglet = (s: string): s is Onglet => ONGLETS.some((o) => o.id === s);

function ChoixServeur() {
  const server = useApp((s) => s.server);
  const prices = useApp((s) => s.prices);
  const n = priceCount(prices, server);
  const age = oldestAge(prices, server);
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Serveur
        <select
          className={cn(champ, "w-56")}
          value={server}
          onChange={(e) => magasinActif().getState().setServer(e.target.value)}
        >
          {SERVEURS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      </label>
      <p className="pb-2 text-xs text-muted-foreground">
        {n === 0 ? "aucun prix saisi" : `${n} prix saisis`}
        {age !== null && age > 7 && ` · le plus ancien a ${age} jours`}
      </p>
    </div>
  );
}

export function RentabilitePage() {
  const pret = useUi((u) => u.pret);
  const [onglet, setOnglet] = useState<Onglet>("simuler");

  /* L'onglet suit l'ancre de l'adresse (#prix, #comparer) : raccourcis du tableau de bord, retour arrière. */
  useEffect(() => {
    const lire = () => {
      const h = location.hash.slice(1);
      setOnglet(estOnglet(h) ? h : "simuler");
    };
    lire();
    window.addEventListener("hashchange", lire);
    return () => window.removeEventListener("hashchange", lire);
  }, []);

  const changer = (v: unknown) => {
    if (typeof v !== "string" || !estOnglet(v)) return;
    setOnglet(v);
    history.replaceState(null, "", v === "simuler" ? location.pathname : `#${v}`);
  };

  return (
    <Page>
      <EnTete titre="Rentabilité" actions={<BoutonDemo />}>
        Un accouplement est-il rentable avec tes prix HDV ? Choisis la génération visée, saisis les prix demandés, lis
        le verdict.
      </EnTete>
      {!pret ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : (
        <>
          <ChoixServeur />
          <Tabs value={onglet} onValueChange={changer} className="gap-4">
            <TabsList className="h-11! w-full sm:w-fit">
              {ONGLETS.map(({ id, label, icone: Icone }) => (
                <TabsTrigger key={id} value={id} className="px-3 text-sm data-active:font-semibold">
                  <Icone aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="simuler">
              <Simulateur />
            </TabsContent>
            <TabsContent value="prix">
              <PrixHdv />
            </TabsContent>
            <TabsContent value="comparer">
              <Comparatif />
            </TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}
