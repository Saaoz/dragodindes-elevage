"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleHelp, CircleX, RotateCcw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { magasinActif, useApp } from "@/components/app-state";
import { Choix } from "@/components/commun/choix";
import { champ } from "@/components/commun/champ";
import { AgePrix } from "@/components/rentabilite/age-prix";
import { ChampKamas } from "@/components/rentabilite/champ-kamas";
import { LIEUX_VENTE } from "@/lib/data";
import { compute, fmt, type CalcSettings, type ComputeResult } from "@/lib/calc";
import {
  manquants, patchCibleSimple, prixNecessaires, texteSeuil, valeurNecessaire, verdict, type Necessaire,
} from "@/lib/rentabilite";
import { ageDays, priceValues } from "@/lib/store";
import { defaultCalc, type CalcState, type PriceKey } from "@/lib/schema";
import { cn } from "@/lib/utils";

const GENS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const signe = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
const pct = (p: number) => `${(p * 100).toFixed(p * 100 % 1 === 0 ? 0 : 1).replace(".", ",")} %`;

/* ---------- résumé des hypothèses en une ligne (mode simple) ---------- */
function resume(c: CalcState): string {
  const morceaux = [
    `parents gén. ${c.genA} × gén. ${c.genB} (niv. ${c.lvlA} et ${c.lvlB}, ${c.origin === "hdv" ? "achetés à l'HDV" : "déjà à toi"})`,
    `vente : ${LIEUX_VENTE.find((l) => l.id === c.lieuVente)?.label ?? ""}`,
    c.opti ? `Optimakina +${c.optiBonus} %` : "sans Optimakina",
    c.parentsMode === "extract" ? "parents extraits ensuite" : c.parentsMode === "sell" ? "parents revendus ensuite" : "parents gardés",
  ];
  if (c.takeza) morceaux.push("Takeza +20 %");
  if (c.repro) morceaux.push("Reproducteur (2 bébés)");
  if (c.countGenetons) morceaux.push("Génétons comptés");
  return morceaux.join(" · ");
}

/* ---------- le verdict ---------- */
function Verdict({ r, manque, cible }: { r: ComputeResult; manque: Necessaire[]; cible: number }) {
  const v = verdict(r, manque.map((n) => n.label));
  const style = {
    incomplet: { boite: "border-border bg-muted/60", icone: CircleHelp, couleur: "text-muted-foreground" },
    rentable: { boite: "border-success/50 bg-success/10", icone: CircleCheck, couleur: "text-success" },
    pasRentable: { boite: "border-destructive/50 bg-destructive/10", icone: CircleX, couleur: "text-destructive" },
    equilibre: { boite: "border-warning/50 bg-warning/10", icone: Scale, couleur: "text-warning" },
  }[v.statut];
  const Icone = style.icone;
  return (
    <section
      aria-labelledby="titre-verdict"
      aria-live="polite"
      data-testid="verdict"
      className={cn("flex flex-col gap-3 rounded-xl border-2 p-4", style.boite)}
    >
      <h2 id="titre-verdict" className="sr-only">
        Verdict
      </h2>
      <div className="flex items-start gap-3">
        <Icone className={cn("mt-0.5 size-7 shrink-0", style.couleur)} aria-hidden />
        <div className="min-w-0">
          {v.statut === "incomplet" ? (
            <>
              <p className="text-xl font-bold">
                Il manque {v.manque.length} prix
              </p>
              <p className="text-sm text-muted-foreground">Renseigne : {v.manque.join(", ")}.</p>
            </>
          ) : (
            <>
              <p className={cn("text-2xl font-bold", style.couleur)}>
                {v.statut === "rentable" ? "Rentable" : v.statut === "pasRentable" ? "Pas rentable" : "À l'équilibre"}
              </p>
              <p className="text-sm">
                <strong className="tabular-nums">{signe(v.profit)} kamas</strong> par couple en moyenne (gén. {cible}).
              </p>
            </>
          )}
        </div>
      </div>
      {v.statut !== "incomplet" && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Chance", pct(r.p)],
            ["Si ça passe", signe(r.profitSuccess)],
            ["Si ça rate", signe(r.profitFail)],
          ].map(([t, val]) => (
            <div key={t} className="rounded-lg bg-background/70 px-1 py-2">
              <dt className="text-xs text-muted-foreground">{t}</dt>
              <dd className="text-sm font-semibold tabular-nums">{val}</dd>
            </div>
          ))}
        </dl>
      )}
      {v.statut !== "incomplet" && (
        <p className="text-xs text-muted-foreground">
          Un couple donne {r.babies} bébé{r.babies > 1 ? "s" : ""} : le résultat réel est « si ça passe » ou « si ça
          rate », la moyenne vaut sur beaucoup de couples. Chance minimale pour être rentable :{" "}
          <strong>{texteSeuil(r.breakEvenP)}</strong>.
        </p>
      )}
    </section>
  );
}

/* ---------- détail du calcul ---------- */
function Detail({ c, r, P }: { c: CalcState; r: ComputeResult; P: ReturnType<typeof priceValues> }) {
  const lignes: [string, number, string?][] = [
    ["Coût des parents", r.costParents],
    ["Carburant", r.fuel],
    ["Optimakina", r.costOpti],
    ["Coût total", r.cost, "font-semibold border-t"],
    ["Récupération des parents", r.recovery],
  ];
  const taxePct = pct(r.taxeTaux).replace(" ", " ");
  const sens = r.priceT > 0 && !r.incomplete
    ? [0.8, 1, 1.2].map((f) => compute({ ...c, priceTarget: Math.round(r.priceT * f) }, P).profitExpected)
    : null;
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-xl p-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Détail du calcul
        <ChevronDown className="chevron size-4 transition-transform" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 text-sm">
        <table className="w-full">
          <tbody>
            {lignes.map(([t, v, cl]) => (
              <tr key={t} className={cl}>
                <th scope="row" className="py-1 text-left font-normal">{t}</th>
                <td className="py-1 text-right tabular-nums">{fmt(v)}</td>
              </tr>
            ))}
            <tr data-testid="ligne-taxe">
              <th scope="row" className="py-1 text-left font-normal">
                {r.taxeTaux > 0 ? `Taxe HDV (${taxePct}), en moyenne` : "Taxe HDV : aucune (0 %)"}
              </th>
              <td className="py-1 text-right tabular-nums">{r.taxeTaux > 0 ? `−${fmt(r.taxeExpected)}` : "0"}</td>
            </tr>
            <tr>
              <th scope="row" className="py-1 text-left font-normal">Génétons gagnés (si succès)</th>
              <td className="py-1 text-right tabular-nums">{r.genGain}</td>
            </tr>
          </tbody>
        </table>
        {sens && (
          <table className="w-full text-center">
            <caption className="mb-1 text-left text-xs text-muted-foreground">
              Si le prix du bébé cible varie (profit moyen par couple)
            </caption>
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="font-normal">−20 %</th>
                <th className="font-normal">Prix actuel</th>
                <th className="font-normal">+20 %</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {sens.map((v, i) => (
                  <td key={i} className={cn("tabular-nums font-medium", v >= 0 ? "text-success" : "text-destructive")}>
                    {signe(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          Hypothèses : un bébé raté vaut le prix de la génération inférieure (ou ton prix forcé) ; le second bébé du
          Reproducteur a les mêmes chances ; la taxe HDV est payée à la mise en vente, une seule fois par objet
          (bébés, parents revendus, neurones, Génétons), et jamais remboursée. 2 % confirmé en jeu ; 1 % et 5 % donnés par un
          joueur.
        </p>
      </div>
    </details>
  );
}

/* ---------- mode avancé : tous les réglages ---------- */
function Avance({ c, set }: { c: CalcState; set: (p: Partial<CalcState>) => boolean }) {
  const gen = (k: "target" | "genA" | "genB", label: string, min: number) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select className={champ} value={c[k]} onChange={(e) => set({ [k]: +e.target.value })}>
        {Array.from({ length: 11 - min }, (_, i) => min + i).map((g) => (
          <option key={g} value={g}>
            Gén. {g}
          </option>
        ))}
      </select>
    </label>
  );
  const niveau = (k: "lvlA" | "lvlB", label: string) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        type="number"
        min={1}
        max={200}
        className={champ}
        defaultValue={c[k]}
        key={c[k]}
        onBlur={(e) => {
          const n = Math.round(+e.target.value);
          if (!set({ [k]: Math.min(200, Math.max(1, Number.isFinite(n) ? n : 1)) } as Partial<CalcState>)) e.target.value = String(c[k]);
        }}
      />
    </label>
  );
  const interrupteur = (k: "opti" | "takeza" | "repro" | "countGenetons", label: string, aide: string) => (
    <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{aide}</span>
      </span>
      <Switch checked={c[k]} onCheckedChange={(v) => set({ [k]: v })} aria-label={label} />
    </label>
  );
  return (
    <div className="flex flex-col gap-5 pt-1">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Générations et niveaux</legend>
        {gen("target", "Génération cible", 2)}
        {gen("genA", "Parent A : génération", 1)}
        {gen("genB", "Parent B : génération", 1)}
        {niveau("lvlA", "Parent A : niveau (1-200)")}
        {niveau("lvlB", "Parent B : niveau (1-200)")}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Bonus de chance</legend>
        {interrupteur("opti", "Utiliser une Optimakina", "Une Makina de génération ≥ à la cible.")}
        <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
          <span className="font-medium">Bonus de l&apos;Optimakina</span>
          <Choix
            label="Bonus de l'Optimakina"
            taille="sm"
            valeur={c.optiBonus}
            onChange={(v) => set({ optiBonus: v })}
            disabled={!c.opti}
            options={[
              { valeur: 20, label: "+20 % (3.7)" },
              { valeur: 10, label: "+10 % (3.5)" },
            ]}
          />
        </div>
        {interrupteur("takeza", "Takeza (Almanax)", "+20 % sur la génération cible, à date variable.")}
        {interrupteur("repro", "Capacité Reproducteur", "Un 2ᵉ bébé, avec les mêmes chances.")}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Parents et coûts</legend>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Origine des parents</span>
          <Choix
            label="Origine des parents"
            taille="sm"
            valeur={c.origin}
            onChange={(v) => set({ origin: v })}
            options={[
              { valeur: "hdv", label: "Achetés à l'HDV" },
              { valeur: "capture", label: "Déjà à moi (0 k)" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Après l&apos;accouplement, les parents…</span>
          <Choix
            label="Après l'accouplement"
            taille="sm"
            valeur={c.parentsMode}
            onChange={(v) => set({ parentsMode: v })}
            options={[
              { valeur: "extract", label: "Extraits" },
              { valeur: "sell", label: "Revendus" },
              { valeur: "none", label: "Gardés (0 k)" },
            ]}
          />
        </div>
        {c.parentsMode === "sell" && (
          <ChampKamas label="Revente d'un parent stérile" valeur={c.sterileSell} onValider={(v) => set({ sterileSell: v })} />
        )}
        <ChampKamas label="Carburant par couple" valeur={c.fuel} onValider={(v) => set({ fuel: v })} />
        <ChampKamas
          label="Forcer le prix du bébé réussi"
          placeholder="vide = prix HDV"
          valeur={c.priceTarget}
          onValider={(v) => set({ priceTarget: v })}
        />
        <ChampKamas
          label="Forcer le prix du bébé raté"
          placeholder="vide = gén. inférieure"
          valeur={c.priceFail}
          onValider={(v) => set({ priceFail: v })}
        />
        {interrupteur("countGenetons", "Compter les Génétons", "Seulement si le bébé dépasse la génération des parents.")}
      </fieldset>

      <Button variant="outline" className="self-start" onClick={() => set(defaultCalc())}>
        <RotateCcw aria-hidden /> Revenir aux réglages par défaut
      </Button>
    </div>
  );
}

/* ---------- l'onglet Simuler ---------- */
export function Simulateur() {
  const server = useApp((s) => s.server);
  const prices = useApp((s) => s.prices);
  const c = useApp((s) => s.calc);
  const matB = useApp((s) => s.matB);
  const [avance, setAvance] = useState(false);
  const set = (p: Partial<CalcState>) => magasinActif().getState().setCalc(p);
  const setPrix = (key: PriceKey, v: number) => magasinActif().getState().setPrice(server, key, v);

  const P = priceValues(prices, server);
  const r = compute(c as CalcSettings, P);
  const necessaires = prixNecessaires(c);
  const manque = manquants(c, P);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="flex flex-col gap-4">
        <section aria-labelledby="titre-cible" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <h2 id="titre-cible" className="font-semibold">
            Génération que tu vises
          </h2>
          <Choix
            label="Génération cible"
            valeur={c.target}
            onChange={(t) => set(patchCibleSimple(t, matB))}
            options={GENS.map((g) => ({ valeur: g, label: String(g), aria: `Génération ${g}` }))}
            className="grid max-w-md grid-cols-9 gap-1 [&>button]:justify-center [&>button]:gap-0.5 [&>button]:px-0"
          />
          <h3 className="text-sm font-medium">Où tu vends</h3>
          <Choix
            label="Où tu vends"
            valeur={c.lieuVente}
            onChange={(v) => set({ lieuVente: v })}
            options={LIEUX_VENTE.map((l) => ({
              valeur: l.id,
              label: `${l.label} · ${(l.taux * 100).toString().replace(".", ",")} %`,
              aria: l.detail,
            }))}
            className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap [&>button]:h-11 [&>button]:justify-center [&>button]:px-2 [&>button]:whitespace-normal sm:[&>button]:h-9 sm:[&>button]:whitespace-nowrap"
          />
          <p className="text-xs text-muted-foreground">
            Taxe de mise en vente, payée même si ça ne se vend pas. 2 % confirmé en jeu ; 1 % et 5 % donnés par un joueur.
          </p>
          <p className="text-xs text-muted-foreground">
            Hypothèses : {resume(c)}.{" "}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-4"
              onClick={() => setAvance(true)}
            >
              Modifier
            </button>
          </p>
        </section>

        <section aria-labelledby="titre-prix-necessaires" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div>
            <h2 id="titre-prix-necessaires" className="font-semibold">
              Prix nécessaires · {server}
            </h2>
            <p className="text-xs text-muted-foreground">
              Seulement ce que ce calcul utilise. Tous tes prix sont dans l&apos;onglet « Mes prix ».
            </p>
          </div>
          {necessaires.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun prix à saisir avec ces réglages.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {necessaires.map((n) => {
                const val = valeurNecessaire(n, c as CalcSettings, P);
                const propre = n.type === "prix" ? (prices[server]?.[n.key as PriceKey]?.v ?? 0) : c.sterileSell;
                const repli = n.type === "prix" && propre === 0 && val > 0; // Optimakina d'une génération supérieure
                return (
                  <li key={n.key} className="grid grid-cols-[1fr_9.5rem] items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[1fr_11rem_6.5rem]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.roles.join(", ")}
                        {repli && ` · à défaut, Optimakina d'une génération supérieure : ${fmt(val)}`}
                      </p>
                    </div>
                    <ChampKamas
                      label={`Prix : ${n.label}`}
                      cacherLabel
                      valeur={propre}
                      onValider={(v) => (n.type === "prix" ? setPrix(n.key as PriceKey, v) : set({ sterileSell: v }))}
                    />
                    <div className="col-span-2 sm:col-span-1 sm:text-right">
                      {n.type === "prix" && <AgePrix jours={ageDays(prices, server, n.key as PriceKey)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Verdict r={r} manque={manque} cible={c.target} />
        <Detail c={c} r={r} P={P} />
      </div>

      <Collapsible open={avance} onOpenChange={setAvance} className="rounded-xl border bg-card lg:col-span-2">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span>
            <span className="block font-semibold">Mode avancé</span>
            <span className="block text-xs text-muted-foreground">
              Niveaux, Optimakina, Takeza, Reproducteur, Génétons, prix forcés, origine et devenir des parents.
            </span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 transition-transform", avance && "rotate-180")} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">
          <Avance c={c} set={set} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
