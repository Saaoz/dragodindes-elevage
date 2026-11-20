"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CAPACITE_JAUGE } from "@/lib/data";
import {
  enclosDeBrouillon,
  formatSerenite,
  MAX_MONTURES,
  parseNombre,
  VISAGES,
  type Brouillon,
} from "@/lib/enclos";
import { AUTRES_JAUGES, type Enclos } from "@/lib/schema";
import { cn } from "@/lib/utils";

export const ICONES_JAUGE: Record<(typeof AUTRES_JAUGES)[number], string> = {
  Endurance: "⚡",
  Maturité: "💧",
  Amour: "❤",
  "Expérience de monture": "⭐",
};

export const champ =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const COULEURS_VISAGE: Record<string, string> = {
  rouge: "bg-red-500/15 text-red-700 ring-red-500 dark:text-red-300",
  bleu: "bg-sky-500/15 text-sky-700 ring-sky-500 dark:text-sky-300",
  violet: "bg-violet-500/15 text-violet-700 ring-violet-500 dark:text-violet-300",
  vert: "bg-green-500/15 text-green-700 ring-green-500 dark:text-green-300",
};

export function EnclosForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Brouillon;
  onSave: (e: Enclos) => void;
  onCancel: () => void;
}) {
  const [b, setB] = useState<Brouillon>(initial);
  const [erreurs, setErreurs] = useState<string[]>([]);

  const setSerenite = (i: number, v: string) =>
    setB((p) => ({ ...p, serenites: p.serenites.map((x, k) => (k === i ? v : x)) }));

  const enregistrer = (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = enclosDeBrouillon(b, Date.now());
    if (r.ok) onSave(r.enclos);
    else setErreurs(r.erreurs);
  };

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-4" aria-label="Saisie de l'enclos">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nom de l&apos;enclos
        <input className={champ} value={b.nom} maxLength={60} onChange={(e) => setB({ ...b, nom: e.target.value })} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sérénité de chaque monture (clique le visage ou tape la valeur)</legend>
        {b.serenites.map((txt, i) => {
          const n = parseNombre(txt);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Monture ${i + 1}`}>
              <span className="w-4 text-sm text-muted-foreground">{i + 1}</span>
              <div className="flex gap-1">
                {VISAGES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    title={`${v.nom} : ${v.effet} (${formatSerenite(v.valeur)})`}
                    aria-label={`Monture ${i + 1} : visage ${v.nom.toLowerCase()} (${v.effet})`}
                    aria-pressed={n === v.valeur}
                    onClick={() => setSerenite(i, String(v.valeur))}
                    className={cn(
                      "size-8 sm:size-9 rounded-full font-mono text-sm font-bold outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
                      COULEURS_VISAGE[v.id],
                      n === v.valeur && "ring-2",
                    )}
                  >
                    {v.texte}
                  </button>
                ))}
              </div>
              <input
                className={cn(champ, "w-24 sm:w-28")}
                inputMode="numeric"
                placeholder="ex. -3000"
                aria-label={`Sérénité exacte de la monture ${i + 1}`}
                value={txt}
                onChange={(e) => setSerenite(i, e.target.value)}
              />
              {b.serenites.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Retirer la monture ${i + 1}`}
                  onClick={() => setB((p) => ({ ...p, serenites: p.serenites.filter((_, k) => k !== i) }))}
                >
                  ✕
                </Button>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Visages : rouge = Endurance ({formatSerenite(VISAGES[0].valeur)}), bleu = Endurance + Maturité (
          {formatSerenite(VISAGES[1].valeur)}), violet = Maturité + Amour ({formatSerenite(VISAGES[2].valeur)}), vert =
          Amour ({formatSerenite(VISAGES[3].valeur)}). Le jeu ne donne qu&apos;une plage : c&apos;est le milieu qui est
          retenu. Pour être précis, tape la valeur exacte.
        </p>
        {b.serenites.length < MAX_MONTURES && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setB((p) => ({ ...p, serenites: [...p.serenites, ""] }))}
          >
            + Ajouter une monture ({b.serenites.length}/{MAX_MONTURES})
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Jauge de sérénité active</legend>
        <div className="flex flex-wrap gap-2">
          {([["+", "Sérénité +"], ["-", "Sérénité −"], [null, "Aucune"]] as const).map(([val, label]) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={b.sens === val ? "default" : "outline"}
              aria-pressed={b.sens === val}
              onClick={() => setB({ ...b, sens: val })}
            >
              {label}
            </Button>
          ))}
        </div>
        {b.sens && (
          <label className="flex flex-col gap-1 text-sm">
            Niveau (0 à {CAPACITE_JAUGE.toLocaleString("fr-FR")}, « 85k » accepté)
            <input
              className={cn(champ, "max-w-48")}
              inputMode="numeric"
              placeholder="ex. 200000 ou 85k"
              value={b.niveau}
              onChange={(e) => setB({ ...b, niveau: e.target.value })}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Autre jauge (facultatif)</legend>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={b.autre === null ? "default" : "outline"} onClick={() => setB({ ...b, autre: null })}>
            Aucune
          </Button>
          {AUTRES_JAUGES.map((j) => (
            <Button
              key={j}
              type="button"
              size="sm"
              variant={b.autre === j ? "default" : "outline"}
              aria-pressed={b.autre === j}
              onClick={() => setB({ ...b, autre: j })}
            >
              {j} {ICONES_JAUGE[j]}
            </Button>
          ))}
        </div>
        {b.autre && (
          <label className="flex flex-col gap-1 text-sm">
            Niveau de la jauge {b.autre}
            <input
              className={cn(champ, "max-w-48")}
              inputMode="numeric"
              placeholder="ex. 120k"
              value={b.niveauAutre}
              onChange={(e) => setB({ ...b, niveauAutre: e.target.value })}
            />
          </label>
        )}
      </fieldset>

      {erreurs.length > 0 && (
        <ul role="alert" className="list-disc rounded-lg bg-red-500/10 p-3 pl-6 text-sm text-red-700 dark:text-red-300">
          {erreurs.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Button type="submit">Enregistrer (je quitte l&apos;enclos)</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
