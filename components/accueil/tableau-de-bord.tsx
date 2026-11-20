"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Calculator, Clock, Fence, Search, Tags, TriangleAlert } from "lucide-react";
import { useApp, useUi } from "@/components/app-state";
import { Page } from "@/components/commun/en-tete";
import { InstallApp } from "@/components/install-app";
import { buttonVariants } from "@/components/ui/button";
import { enclosUrgents, formatDuree, formatHeure, libelleRetard } from "@/lib/enclos";
import { almanaxDuMois } from "@/lib/guide";
import { cn } from "@/lib/utils";

const carte = "rounded-xl border bg-card p-4 text-card-foreground shadow-xs";

function EnclosASurveiller() {
  const pret = useUi((u) => u.pret);
  const enclos = useApp((s) => s.enclos);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const urgents = enclosUrgents(enclos, maintenant, 3);
  const saisis = enclos.filter((e) => e.saisieLe !== null).length;

  return (
    <section aria-labelledby="titre-surveiller" className={cn(carte, "flex flex-col gap-3 md:col-span-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titre-surveiller" className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="size-5 text-primary" aria-hidden /> Quand revenir à l&apos;enclos
        </h2>
        {pret && <span className="text-xs text-muted-foreground">{saisis} / 6 enclos saisis</span>}
      </div>
      {!pret ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : urgents.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-muted/60 p-4">
          <p className="text-sm">
            {saisis === 0
              ? "Aucun enclos saisi. En quittant un enclos, note la sérénité des montures : l'outil te dira à quelle heure revenir."
              : "Aucune jauge de sérénité active : pas d'heure de retour à prévoir."}
          </p>
          <Link href="/enclos" className={buttonVariants({ size: "lg" })}>
            <Fence aria-hidden /> Saisir un enclos
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {urgents.map((v, rang) => {
            const e = enclos[v.index];
            const nom = e.nom || `Enclos ${v.index + 1}`;
            const reste = (v.retour!.quandMs - maintenant) / 1000;
            const urgent = v.alerte !== null || reste < 900;
            return (
              <li key={v.index}>
                <Link
                  href={`/enclos#enclos-${v.index + 1}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    rang === 0 && (urgent ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"),
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nom}</p>
                    <p className={cn("font-bold tabular-nums", rang === 0 ? "text-xl" : "text-base")}>
                      {v.retardS !== null ? "Retour dépassé" : `Reviens avant ${formatHeure(v.retour!.quandMs, maintenant)}`}
                    </p>
                    <p className={cn("text-xs", urgent ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {v.retardS !== null
                        ? `depuis ${formatDuree(v.retardS)} · ${libelleRetard(v, maintenant)}`
                        : `dans ${formatDuree(reste)}`}
                      {v.alerte && v.retardS === null &&" · une monture va atteindre ±5 000"}
                    </p>
                  </div>
                  {v.alerte && <TriangleAlert className="size-5 shrink-0 text-destructive" aria-label="Alerte" />}
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {pret && urgents.length > 0 && (
        <Link href="/enclos" className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          Voir les 6 enclos
        </Link>
      )}
    </section>
  );
}

function Almanax() {
  /* calculé côté client : le mois dépend de l'heure locale de l'appareil */
  const [date, setDate] = useState<Date | null>(null);
  useEffect(() => setDate(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  const a = date ? almanaxDuMois(date) : null;
  return (
    <section aria-labelledby="titre-almanax" className={cn(carte, "flex flex-col gap-3")}>
      <h2 id="titre-almanax" className="flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5 text-primary" aria-hidden /> Bonus Almanax
      </h2>
      {a && (
        <>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Ce mois-ci · {a.actuel.mois} ({a.actuel.dieu})
            </p>
            <p className="mt-0.5 font-medium">{a.actuel.bonus}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Le mois prochain · {a.suivant.mois} ({a.suivant.dieu})
            </p>
            <p className="mt-0.5 text-sm">{a.suivant.bonus}</p>
          </div>
          <Link href="/guide#almanax" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Les 12 mois dans le guide
          </Link>
        </>
      )}
    </section>
  );
}

const RACCOURCIS = [
  { href: "/enclos", titre: "Saisir un enclos", texte: "Je quitte l'enclos : à quelle heure revenir ?", icone: Fence },
  { href: "/rentabilite", titre: "Simuler un couple", texte: "Rentable ou pas, avec tes prix HDV.", icone: Calculator },
  { href: "/rentabilite#prix", titre: "Mes prix HDV", texte: "Saisir, coller, importer l'export de la v2.", icone: Tags },
  { href: "/guide#croisements", titre: "Chercher une couleur", texte: "Générations et croisements.", icone: Search },
  { href: "/guide", titre: "Guide", texte: "Capture, reproduction, jauges 3.7, sources.", icone: BookOpen },
] as const;

export function TableauDeBord() {
  return (
    <Page>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Élevage de dragodindes</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Ce qui compte maintenant, en un coup d&apos;œil.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <EnclosASurveiller />
        <Almanax />
      </div>
      <section aria-labelledby="titre-raccourcis" className="flex flex-col gap-3">
        <h2 id="titre-raccourcis" className="text-lg font-semibold">
          Raccourcis
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RACCOURCIS.map(({ href, titre, texte, icone: Icone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full items-center gap-3 rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icone className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{titre}</span>
                  <span className="block text-sm text-muted-foreground">{texte}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <InstallApp />
    </Page>
  );
}
