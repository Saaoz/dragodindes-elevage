"use client";

import { useEffect, useState } from "react";
import { Code, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnTete, Page } from "@/components/commun/en-tete";
import { CarteCode } from "@/components/carte/carte-code";
import { CarteJoueurs } from "@/components/carte/carte-joueurs";

const ONGLETS = [
  { id: "joueurs", label: "Pour les joueurs", icone: Users },
  { id: "code", label: "Pour les développeurs", icone: Code },
] as const;
type Onglet = (typeof ONGLETS)[number]["id"];
const estOnglet = (s: string): s is Onglet => ONGLETS.some((o) => o.id === s);

export function CartePage() {
  const [onglet, setOnglet] = useState<Onglet>("joueurs");

  /* L'onglet suit l'ancre de l'adresse (#joueurs, #code) : lien direct, retour arrière. */
  useEffect(() => {
    const lire = () => {
      const h = location.hash.slice(1);
      setOnglet(estOnglet(h) ? h : "joueurs");
    };
    lire();
    window.addEventListener("hashchange", lire);
    return () => window.removeEventListener("hashchange", lire);
  }, []);

  const changer = (v: unknown) => {
    if (typeof v !== "string" || !estOnglet(v)) return;
    setOnglet(v);
    history.replaceState(null, "", `#${v}`);
  };

  return (
    <Page>
      <EnTete titre="Carte du site">
        Tout ce que propose l&apos;outil, d&apos;un coup d&apos;œil : choisis une fonctionnalité pour savoir à quoi elle
        sert et l&apos;ouvrir directement.
      </EnTete>
      <Tabs value={onglet} onValueChange={changer} className="gap-4">
        <TabsList className="h-11! w-full sm:w-fit">
          {ONGLETS.map(({ id, label, icone: Icone }) => (
            <TabsTrigger key={id} value={id} className="px-3 text-sm data-active:font-semibold">
              <Icone aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="joueurs">
          <CarteJoueurs />
        </TabsContent>
        <TabsContent value="code">
          <CarteCode />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
