"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, BookOpen, Coins, Fence, FlaskConical, House } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ECRANS, SITE, trouverNoeud, type Ecran } from "@/lib/carte";
import { cn } from "@/lib/utils";

const ICONES: Record<Ecran["id"], typeof House> = {
  accueil: House,
  enclos: Fence,
  rentabilite: Coins,
  guide: BookOpen,
};

/* Carte des fonctionnalités, faite main en HTML/CSS : le site au centre, les 4 écrans, leurs fonctionnalités.
   C'est une vraie arborescence de listes et de boutons : clavier (Tab, Entrée, Espace) et lecteurs d'écran
   fonctionnent sans artifice, et sur petit écran les colonnes s'empilent en une seule arborescence. */
export function CarteJoueurs() {
  const [choisi, setChoisi] = useState<string | null>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const noeud = choisi ? trouverNoeud(choisi) : undefined;
  const demo = noeud && "demo" in noeud && noeud.demo;

  const choisir = (id: string) => {
    setChoisi(id);
    /* petit écran : le panneau n'est pas collé en haut, on l'amène à l'écran */
    requestAnimationFrame(() => panneau.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        ref={panneau}
        role="region"
        aria-label="Détail"
        aria-live="polite"
        data-testid="detail"
        className="z-20 scroll-mt-24 rounded-xl border bg-card p-4 text-card-foreground shadow-xs md:sticky md:top-16"
      >
        {noeud ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{noeud.titre}</h2>
              {demo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-800 dark:text-sky-200">
                  <FlaskConical className="size-3" aria-hidden /> Visible en démo : apparaît quand des données sont saisies
                </span>
              )}
            </div>
            <p className="text-sm">{noeud.explication}</p>
            <Link href={noeud.href} className={cn(buttonVariants({ size: "lg" }), "self-start")}>
              Ouvrir <ArrowRight aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choisis un écran ou une fonctionnalité sur la carte : son explication et un lien direct s&apos;affichent ici.
          </p>
        )}
      </div>

      <div className="flex flex-col items-center">
        <div className="rounded-2xl border-2 border-primary bg-primary/10 px-5 py-3 text-center">
          <p className="font-semibold">{SITE.titre}</p>
        </div>
        <div className="h-5 w-px bg-border" aria-hidden />
      </div>

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-flow-dense" aria-label="Écrans du site">
        {ECRANS.map((ecran) => {
          const Icone = ICONES[ecran.id];
          return (
            <li key={ecran.id} className={cn(ecran.id === "enclos" && "lg:row-span-2")}>
              <section aria-labelledby={`ecran-${ecran.id}`} className="flex flex-col gap-2 rounded-xl border bg-card/50 p-3">
                <h3 id={`ecran-${ecran.id}`} className="m-0">
                  <button
                    type="button"
                    aria-pressed={choisi === ecran.id}
                    onClick={() => choisir(ecran.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-3 text-left font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      choisi === ecran.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/40 bg-primary/10 hover:bg-primary/20",
                    )}
                  >
                    <Icone className="size-4 shrink-0" aria-hidden />
                    {ecran.titre}
                  </button>
                </h3>
                <ul className="ml-3 flex flex-col gap-1.5 border-l-2 border-border pl-3" aria-label={`Fonctionnalités : ${ecran.titre}`}>
                  {ecran.fonctionnalites.map((f) => (
                    <li key={f.id} className="relative">
                      <span className="absolute top-1/2 -left-3 h-px w-3 bg-border" aria-hidden />
                      <button
                        type="button"
                        aria-pressed={choisi === f.id}
                        data-testid={`noeud-${f.id}`}
                        onClick={() => choisir(f.id)}
                        className={cn(
                          "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                          choisi === f.id ? "border-primary bg-primary/15 font-medium" : "bg-background hover:bg-muted",
                        )}
                      >
                        <span>{f.titre}</span>
                        {f.demo && (
                          <>
                            <FlaskConical className="size-3.5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
                            <span className="sr-only">(visible en démo)</span>
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FlaskConical className="size-3.5 text-sky-700 dark:text-sky-300" aria-hidden /> Cette icône marque ce qui
        n&apos;apparaît qu&apos;une fois des données saisies : le bouton « Voir une démo » permet de l&apos;essayer.
      </p>

      <details className="rounded-xl border p-3" data-testid="liste-complete">
        <summary className="min-h-8 cursor-pointer font-medium">Liste complète en texte</summary>
        <div className="mt-3 flex flex-col gap-4">
          {ECRANS.map((ecran) => (
            <section key={ecran.id} aria-labelledby={`liste-${ecran.id}`}>
              <h3 id={`liste-${ecran.id}`} className="font-semibold">
                <Link href={ecran.href} className="text-primary underline-offset-4 hover:underline">
                  {ecran.titre}
                </Link>
              </h3>
              <p className="text-sm text-muted-foreground">{ecran.explication}</p>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {ecran.fonctionnalites.map((f) => (
                  <li key={f.id}>
                    <Link href={f.href} className="font-medium text-primary underline-offset-4 hover:underline">
                      {f.titre}
                    </Link>
                    {f.demo && <span className="text-muted-foreground"> (visible en démo)</span>} : {f.explication}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
