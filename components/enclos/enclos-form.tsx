"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choix } from "@/components/commun/choix";
import { champ } from "@/components/commun/champ";
import { VisageIcone } from "@/components/commun/visage";
import { IconeJauge } from "@/components/enclos/icone-jauge";
import { CAPACITE_JAUGE } from "@/lib/data";
import {
  APERCU_NEUTRE,
  apercuSaisie,
  changerAutreJauge,
  enclosDeBrouillon,
  estJaugeElevage,
  formatNombre,
  formatSerenite,
  MAX_MONTURES,
  NOM_JAUGE,
  OPTIONS_OBJECTIF,
  parseNombre,
  VISAGES,
  type ApercuSaisie,
  type Brouillon,
} from "@/lib/enclos";
import { AUTRES_JAUGES, type Enclos } from "@/lib/schema";
import { STAT_MAX } from "@/lib/serenity";
import { cn } from "@/lib/utils";

/* Clavier texte (et non pavé numérique) : il faut pouvoir taper « − », « - », « k ». Le parsing accepte ces formes. */
const SAISIE_TEXTE = {
  inputMode: "text",
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

const ANNEAU_VISAGE: Record<string, string> = {
  rouge: "ring-red-600 dark:ring-red-400",
  bleu: "ring-blue-600 dark:ring-blue-400",
  violet: "ring-violet-600 dark:ring-violet-400",
  vert: "ring-green-600 dark:ring-green-400",
};

/* Délai avant d'annoncer l'aperçu au lecteur d'écran : on attend que le joueur ait fini de taper (#64). */
const DELAI_ANNONCE_APERCU_MS = 1200;
const texteApercu = (a: ApercuSaisie) => (a.conseil ? `${a.titre} ${a.conseil}` : a.titre);

export function EnclosForm({
  initial,
  maintenantMs,
  onSave,
  onCancel,
}: {
  initial: Brouillon;
  /* horloge du panneau (chaque seconde) : l'aperçu suit l'heure */
  maintenantMs: number;
  onSave: (e: Enclos) => void;
  onCancel: () => void;
}) {
  /* brouillon d'ouverture (le parent en recrée un à chaque seconde : on garde le premier) */
  const [depart] = useState<Brouillon>(initial);
  const [b, setB] = useState<Brouillon>(depart);
  /* Aperçu en direct (#64) : recalculé à chaque frappe. La version lue par le lecteur d'écran n'est mise à jour
     qu'après une pause de frappe (pas une annonce par touche), et pas à l'ouverture (le focus annonce le premier champ). */
  const apercu = apercuSaisie(b, maintenantMs);
  const [annonceApercu, setAnnonceApercu] = useState(() => texteApercu(apercuSaisie(depart, maintenantMs)));
  useEffect(() => {
    if (b === depart) return;
    const id = setTimeout(() => setAnnonceApercu(texteApercu(apercuSaisie(b, Date.now()))), DELAI_ANNONCE_APERCU_MS);
    return () => clearTimeout(id);
  }, [b, depart]);
  const [erreurs, setErreurs] = useState<string[]>([]);
  /* objectif choisi à la main dans cette saisie : changer l'autre jauge ne le remplace plus */
  const [objectifChoisi, setObjectifChoisi] = useState(false);
  /* à l'ouverture, le focus va sur le premier champ : le lecteur d'écran annonce « Nom de l'enclos » */
  const nomRef = useRef<HTMLInputElement>(null);
  useEffect(() => nomRef.current?.focus(), []);

  const setSerenite = (i: number, v: string) =>
    setB((p) => ({ ...p, serenites: p.serenites.map((x, k) => (k === i ? v : x)) }));
  /* valeur de la jauge d'élevage (#77), alignée sur les sérénités */
  const stats = b.serenites.map((_, i) => b.stats?.[i] ?? "");
  const setStat = (i: number, v: string) => setB((p) => ({ ...p, stats: p.serenites.map((_, k) => (k === i ? v : (p.stats?.[k] ?? ""))) }));
  const jaugeStat = estJaugeElevage(b.autre) ? b.autre : null;

  const enregistrer = (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = enclosDeBrouillon(b, Date.now());
    if (r.ok) onSave(r.enclos);
    else setErreurs(r.erreurs);
  };

  return (
    <form
      onSubmit={enregistrer}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && !ev.defaultPrevented) onCancel();
      }}
      className="flex flex-col gap-5"
      aria-label="Saisie de l'enclos"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nom de l&apos;enclos
        <input ref={nomRef} className={champ} value={b.nom} maxLength={60} onChange={(e) => setB({ ...b, nom: e.target.value })} />
      </label>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-medium">Sérénité de chaque monture</legend>
        <p className="text-xs text-muted-foreground">
          Touche le visage affiché en jeu, ou tape la valeur exacte.
          {jaugeStat &&
            ` Facultatif : ${NOM_JAUGE[jaugeStat].nom} actuelle de chaque monture (0 à ${formatNombre(STAT_MAX)}), pour savoir quand elle atteint le maximum.`}
        </p>
        {b.serenites.map((txt, i) => {
          const n = parseNombre(txt);
          return (
            <div key={i} className="flex flex-col gap-1" role="group" aria-label={`Monture ${i + 1}`}>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="w-5 shrink-0 text-right text-sm font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                <div className="flex shrink-0 gap-0.5 sm:gap-1">
                  {VISAGES.map((v) => {
                    const on = n === v.valeur;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        title={`${v.nom} : ${v.effet} (${formatSerenite(v.valeur)})`}
                        aria-label={`Monture ${i + 1} : visage ${v.nom.toLowerCase()} (${v.effet})`}
                        aria-pressed={on}
                        onClick={() => setSerenite(i, String(v.valeur))}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full sm:size-10 outline-none transition focus-visible:ring-3 focus-visible:ring-ring/60",
                          on ? cn("bg-muted ring-3", ANNEAU_VISAGE[v.id]) : "opacity-80 hover:bg-muted hover:opacity-100",
                        )}
                      >
                        <VisageIcone id={v.id} className="size-7" />
                      </button>
                    );
                  })}
                </div>
                <input
                  className={cn(champ, "w-0 min-w-16 flex-1 sm:w-28 sm:flex-none")}
                  {...SAISIE_TEXTE}
                  placeholder="ex. -3000"
                  aria-label={`Sérénité exacte de la monture ${i + 1}`}
                  value={txt}
                  onChange={(e) => setSerenite(i, e.target.value)}
                />
                {b.serenites.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Retirer la monture ${i + 1}`}
                    onClick={() =>
                      setB((p) => ({
                        ...p,
                        serenites: p.serenites.filter((_, k) => k !== i),
                        stats: p.serenites.map((_, k) => p.stats?.[k] ?? "").filter((_, k) => k !== i),
                      }))
                    }
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </div>
              {jaugeStat && (
                /* #77 : à côté de sa sérénité, la valeur actuelle de la jauge d'élevage (facultative, « 12k » accepté) */
                <label className="flex items-center gap-2 pl-6.5 text-sm text-muted-foreground sm:pl-7">
                  <span className="shrink-0">{jaugeStat}</span>
                  <input
                    className={cn(champ, "w-0 min-w-20 flex-1 sm:w-28 sm:flex-none")}
                    {...SAISIE_TEXTE}
                    placeholder="ex. 12k"
                    aria-label={`${jaugeStat} actuelle de la monture ${i + 1} (facultatif, 0 à ${formatNombre(STAT_MAX)})`}
                    value={stats[i]}
                    onChange={(e) => setStat(i, e.target.value)}
                  />
                  <span className="shrink-0 whitespace-nowrap">/ {formatNombre(STAT_MAX)}</span>
                </label>
              )}
            </div>
          );
        })}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/60 p-2.5 text-xs sm:grid-cols-4">
          {VISAGES.map((v) => (
            <li key={v.id} className="flex items-center gap-1.5">
              <VisageIcone id={v.id} className="size-5" />
              <span>
                <strong className="font-medium">{v.effet}</strong> ·{" "}
                <span className="whitespace-nowrap">{formatSerenite(v.valeur)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Le jeu ne donne qu&apos;une plage par visage : c&apos;est son milieu qui est retenu. Pour être précis, tape la
          valeur exacte (filtre « Sérénité de … à … » de l&apos;Étable).
        </p>
        {b.serenites.length < MAX_MONTURES && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setB((p) => ({ ...p, serenites: [...p.serenites, ""], stats: [...p.serenites.map((_, k) => p.stats?.[k] ?? ""), ""] }))
            }
          >
            <Plus aria-hidden /> Ajouter une monture ({b.serenites.length}/{MAX_MONTURES})
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Jauge de sérénité active</legend>
        <Choix
          label="Jauge de sérénité active"
          valeur={b.sens}
          onChange={(sens) => setB({ ...b, sens })}
          options={[
            { valeur: "+", label: "Sérénité +" },
            { valeur: "-", label: "Sérénité −" },
            { valeur: null, label: "Aucune" },
          ]}
        />
        {b.sens && (
          <label className="flex flex-col gap-1.5 text-sm">
            Niveau (0 à {CAPACITE_JAUGE.toLocaleString("fr-FR")}, « 85k » accepté)
            <input
              className={cn(champ, "max-w-56")}
              {...SAISIE_TEXTE}
              placeholder="ex. 200000 ou 85k"
              value={b.niveau}
              onChange={(e) => setB({ ...b, niveau: e.target.value })}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Autre jauge (facultatif)</legend>
        <Choix
          label="Autre jauge"
          valeur={b.autre}
          onChange={(autre) => setB(changerAutreJauge(b, autre, objectifChoisi))}
          options={[
            { valeur: null, label: "Aucune" },
            ...AUTRES_JAUGES.map((j) => ({ valeur: j, label: j, icone: <IconeJauge jauge={j} /> })),
          ]}
        />
        {b.autre && (
          <label className="flex flex-col gap-1.5 text-sm">
            Niveau de la jauge {b.autre}
            <input
              className={cn(champ, "max-w-56")}
              {...SAISIE_TEXTE}
              placeholder="ex. 120k"
              value={b.niveauAutre}
              onChange={(e) => setB({ ...b, niveauAutre: e.target.value })}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Objectif de sérénité</legend>
        <p className="text-xs text-muted-foreground">
          Proposé selon l&apos;autre jauge : l&apos;Endurance ne monte qu&apos;en sérénité négative, l&apos;Amour qu&apos;en
          sérénité positive, la Maturité entre −2 000 et +2 000.
        </p>
        <Choix
          label="Objectif de sérénité"
          valeur={b.objectif}
          onChange={(objectif) => {
            setObjectifChoisi(true);
            setB({ ...b, objectif });
          }}
          options={OPTIONS_OBJECTIF}
        />
      </fieldset>

      {/* Aperçu visible, mis à jour à chaque frappe ; le lecteur d'écran lit sa copie polie ci-dessous (#64). */}
      <div
        className={cn(
          "flex flex-col gap-1 rounded-lg p-3 text-sm",
          apercu === APERCU_NEUTRE ? "bg-muted text-muted-foreground" : "bg-primary/10",
        )}
        data-testid="apercu-saisie"
        aria-hidden
      >
        <p className="font-medium">{apercu.titre}</p>
        {apercu.conseil && <p>{apercu.conseil}</p>}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="annonce-apercu">
        {annonceApercu}
      </p>

      {erreurs.length > 0 && (
        <ul role="alert" className="list-disc rounded-lg bg-destructive/10 p-3 pl-6 text-sm text-destructive">
          {erreurs.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg">
          Enregistrer (je quitte l&apos;enclos)
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
