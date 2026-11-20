"use client";

import { useEffect, useRef, useState } from "react";
import { magasinActif, useApp } from "@/components/app-state";
import { Choix } from "@/components/commun/choix";
import { fmt, fmtShort, type CalcSettings } from "@/lib/calc";
import { GENS_CIBLES, intensite, matrice, serieGraphique } from "@/lib/rentabilite";
import { cn } from "@/lib/utils";

const court = (v: number) => (v >= 0 ? "+" : "−") + fmtShort(Math.abs(v)).replace(/^−/, "");

function Heatmap() {
  const prices = useApp((s) => s.prices);
  const calc = useApp((s) => s.calc) as CalcSettings;
  const matB = useApp((s) => s.matB);
  const server = useApp((s) => s.server);
  const m = matrice(prices, calc, matB);

  return (
    /* `relative` : les textes sr-only des cases (position: absolute) se rattachent à ce conteneur et non à la page,
       sinon ceux des colonnes de droite élargissent tout le document (le navigateur mobile dézoome). */
    <div className="relative overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">Profit espéré par couple, par serveur et génération cible</caption>
        <thead>
          <tr className="bg-muted/60 text-xs text-muted-foreground">
            <th scope="col" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left font-medium">
              Serveur
            </th>
            {GENS_CIBLES.map((g) => (
              <th key={g} scope="col" className="px-1 py-2 font-medium">
                Gén. {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.lignes.map((l) => (
            <tr key={l.server} className={cn("border-t", l.server === server && "font-medium")}>
              <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium">
                <span className="block whitespace-nowrap">{l.server}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {l.nbPrix === 0 ? "aucun prix" : `${l.nbPrix} prix`}
                  {l.age !== null && l.age > 7 && ` · ${l.age} j`}
                </span>
              </th>
              {l.cases.map(({ g, r }) => {
                if (r.incomplete)
                  return (
                    <td key={g} className="hachures px-1 py-1.5 text-center text-muted-foreground" title={`Prix manquants : ${r.missing.join(", ")}`}>
                      <span aria-hidden>—</span>
                      <span className="sr-only">prix manquants</span>
                    </td>
                  );
                const v = r.profitExpected;
                const a = intensite(v, m.maxAbs);
                const meilleur = v === l.meilleur;
                return (
                  <td
                    key={g}
                    className={cn("px-1 py-1.5 text-center tabular-nums", meilleur && "outline-2 -outline-offset-2 outline-foreground")}
                    style={{
                      backgroundColor: `color-mix(in oklch, var(${v >= 0 ? "--chart-1" : "--chart-2"}) ${Math.round(a * 100)}%, transparent)`,
                    }}
                    title={`Succès ${fmt(r.profitSuccess)} / échec ${fmt(r.profitFail)}`}
                  >
                    {court(v)}
                    {meilleur && <span className="sr-only"> (meilleure du serveur)</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Graphique() {
  const prices = useApp((s) => s.prices);
  const calc = useApp((s) => s.calc) as CalcSettings;
  const matB = useApp((s) => s.matB);
  const server = useApp((s) => s.server);
  const conteneur = useRef<HTMLElement>(null);
  const [largeur, setLargeur] = useState(640);
  /* Sans dépendances : le <figure> n'existe qu'une fois des prix saisis, on se rattache dès qu'il apparaît. */
  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const mesurer = () => setLargeur(Math.round(el.getBoundingClientRect().width) || 640);
    mesurer();
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    return () => o.disconnect();
  });
  const serie = serieGraphique(prices, server, calc, matB);
  const ok = serie.filter((s) => !s.r.incomplete);
  if (!ok.length)
    return (
      <p className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
        Renseigne les prix des générations de {server} pour voir le graphique.
      </p>
    );
  /* Le viewBox suit la largeur réelle : 1 unité = 1 px CSS, donc les textes restent à 12 px quel que soit l'écran. */
  const W = Math.max(280, largeur),
    H = 260,
    pl = 56,
    pb = 30,
    pt = 22,
    taille = 12,
    ecart = 14;
  const vals = ok.flatMap((s) => [s.r.profitFail, s.r.profitSuccess, 0]);
  const lo = Math.min(...vals),
    hi = Math.max(...vals),
    span = hi - lo || 1;
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / span);
  const bw = (W - pl - 10) / GENS_CIBLES.length;
  /* Repères min / 0 / max : le zéro reste sur sa ligne ; le max remonte et le min descend si leur texte chevaucherait le zéro. */
  const y0 = y(0);
  const reperes = [
    { cle: "max", v: hi, ty: Math.min(y(hi), y0 - ecart), garde: hi !== 0 },
    { cle: "zero", v: 0, ty: y0, garde: true },
    { cle: "min", v: lo, ty: Math.max(y(lo), y0 + ecart), garde: lo !== 0 },
  ].filter((r) => r.garde);
  return (
    <figure ref={conteneur} className="flex min-w-0 flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`Profit espéré par génération cible sur ${server}`} className="block w-full text-foreground">
        {reperes.map((r) => (
          <g key={r.cle}>
            <line
              x1={pl}
              x2={W - 6}
              y1={y(r.v)}
              y2={y(r.v)}
              stroke="currentColor"
              opacity={r.cle === "zero" ? 0.5 : 0.15}
              strokeDasharray={r.cle === "zero" ? undefined : "3 3"}
            />
            <text x={pl - 6} y={r.ty + 4} textAnchor="end" fontSize={taille} fill="currentColor" opacity={0.85}>
              {r.cle === "zero" ? "0" : fmtShort(r.v)}
            </text>
          </g>
        ))}
        {serie.map(({ g, r }, i) => {
          const x = pl + i * bw + bw / 2;
          return (
            <g key={g}>
              <text x={x} y={H - 8} textAnchor="middle" fontSize={taille} fill="currentColor" opacity={0.75}>
                {g}
              </text>
              {r.incomplete ? (
                <text x={x} y={y0 - 6} textAnchor="middle" fontSize={taille} fill="currentColor" opacity={0.45}>
                  —
                </text>
              ) : (
                <>
                  <rect
                    x={x - bw * 0.28}
                    y={Math.min(y(r.profitExpected), y(0))}
                    width={bw * 0.56}
                    height={Math.abs(y(r.profitExpected) - y(0)) || 1}
                    rx={3}
                    fill={r.profitExpected >= 0 ? "var(--chart-1)" : "var(--chart-2)"}
                  >
                    <title>{`Gén. ${g} : espéré ${fmt(r.profitExpected)} (échec ${fmt(r.profitFail)} / succès ${fmt(r.profitSuccess)})`}</title>
                  </rect>
                  <line x1={x} x2={x} y1={y(r.profitFail)} y2={y(r.profitSuccess)} stroke="currentColor" strokeWidth={2} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        Barre = profit espéré ; trait = de « si ça rate » à « si ça passe ». Axe horizontal : génération cible.
      </figcaption>
    </figure>
  );
}

export function Comparatif() {
  const matB = useApp((s) => s.matB);
  const server = useApp((s) => s.server);
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titre-heatmap" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div>
          <h2 id="titre-heatmap" className="font-semibold">
            Serveurs × génération cible
          </h2>
          <p className="text-sm text-muted-foreground">
            Profit espéré par couple avec <strong>tes</strong> prix de chaque serveur. Parent A de la génération juste en
            dessous, parents achetés à l&apos;HDV ; les autres réglages viennent du simulateur. Case encadrée : la
            meilleure du serveur. Hachures : prix manquants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Parent B</span>
          <Choix
            label="Génération du parent B"
            taille="sm"
            valeur={matB}
            onChange={(v) => magasinActif().getState().setMatB(v)}
            options={[
              { valeur: "same", label: "Même génération que A" },
              { valeur: "gen1", label: "Génération 1 (capturée)" },
            ]}
          />
        </div>
        <Heatmap />
      </section>
      <section aria-labelledby="titre-graphique" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 id="titre-graphique" className="font-semibold">
          Graphique · {server}
        </h2>
        <Graphique />
      </section>
    </div>
  );
}
