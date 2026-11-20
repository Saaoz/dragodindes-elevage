"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, Copy, Download, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { magasinActif, useApp } from "@/components/app-state";
import { champ } from "@/components/commun/champ";
import { AgePrix } from "@/components/rentabilite/age-prix";
import { ChampKamas } from "@/components/rentabilite/champ-kamas";
import { GENERATIONS, SERVEURS } from "@/lib/data";
import { ageDays, priceCount } from "@/lib/store";
import { PRICE_KEYS, type PriceKey } from "@/lib/schema";
import { cn } from "@/lib/utils";

/* Lien vers la v2 figée dans le dépôt (dernier commit qui la contient), pour exporter ses anciens prix. */
export const LIEN_V2 = "https://github.com/Saaoz/dragodindes-elevage/tree/34f71ad/legacy";

const GROUPES: { titre: string; lignes: { key: PriceKey; label: string; aide: string }[] }[] = [
  {
    titre: "Montures",
    lignes: GENERATIONS.map((g) => ({
      key: `g${g.gen}` as PriceKey,
      label: `Génération ${g.gen}`,
      aide: `${g.couleurs.length} couleur${g.couleurs.length > 1 ? "s" : ""}`,
    })),
  },
  {
    titre: "Optimakina (une par génération cible)",
    lignes: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => ({
      key: `opti${g}` as PriceKey,
      label: `Optimakina gén. ${g}`,
      aide: `pour viser la gén. ${g}`,
    })),
  },
  {
    titre: "Ressources",
    lignes: [
      { key: "neurone", label: "Neurone", aide: "ressource d'extraction" },
      { key: "genetons", label: "Valeur d'un Géténon", aide: "ce que tu en fais (parchemins…)" },
    ],
  },
];

function telechargerJson(nom: string, contenu: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrixHdv() {
  const server = useApp((s) => s.server);
  const prices = useApp((s) => s.prices);
  const demo = useApp((s) => s.demo);
  const futureVersion = useApp((s) => s.futureVersion);
  const [collage, setCollage] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const magasin = () => magasinActif().getState();
  const info = SERVEURS.find((s) => s.id === server)!;
  const n = priceCount(prices, server);
  const importBloque = demo || futureVersion;

  const importerFichier = async (f: File) => {
    const texte = await f.text();
    if (!confirm("Importer ce fichier remplace tes prix et réglages actuels (et tes enclos s'il en contient). Continuer ?")) return;
    const r = magasin().importJSON(texte);
    setMessage({ ok: r.ok, texte: r.ok ? `${r.msg} Les prix de tous les serveurs ont été repris.` : r.msg });
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titre-mes-prix" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 basis-64 flex-1">
            <h2 id="titre-mes-prix" className="font-semibold">
              Mes prix HDV · {server}
            </h2>
            <p className="text-xs text-muted-foreground">
              {info.type}. {info.note}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              n === 0 ? "bg-destructive/10 text-destructive" : n < PRICE_KEYS.length ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
            )}
          >
            {n} / {PRICE_KEYS.length} prix renseignés
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Aucun prix par défaut : aucune source publique ne donne les prix HDV par serveur. Chaque prix est daté ;
          au-delà de 7 jours, le badge passe à l&apos;orange.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={n === 0}
            onClick={() => {
              if (confirm(`Copier les prix de ${server} vers TOUS les autres serveurs ? Leurs prix actuels seront écrasés.`))
                magasin().copyToAll(server);
            }}
          >
            <Copy aria-hidden /> Copier vers tous les serveurs
          </Button>
          <Button
            variant="outline"
            disabled={n === 0}
            onClick={() => {
              if (confirm(`Vider tous les prix de ${server} ? (Pense à exporter avant.)`)) magasin().clearServer(server);
            }}
          >
            <Trash2 aria-hidden /> Vider ce serveur
          </Button>
        </div>

        {GROUPES.map((g) => (
          <div key={g.titre} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-muted-foreground">{g.titre}</h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {g.lignes.map((l) => {
                const e = prices[server]?.[l.key];
                return (
                  <li key={l.key} className="grid grid-cols-[1fr_7.5rem_2.25rem] items-center gap-x-2 gap-y-1 px-3 py-2 sm:grid-cols-[1fr_10rem_6.5rem_2.25rem]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{l.label}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {l.aide}
                        <AgePrix jours={ageDays(prices, server, l.key)} className="sm:hidden" />
                      </p>
                    </div>
                    <ChampKamas
                      label={`Prix : ${l.label}`}
                      cacherLabel
                      valeur={e?.v ?? 0}
                      onValider={(v) => magasin().setPrice(server, l.key, v)}
                    />
                    <AgePrix jours={ageDays(prices, server, l.key)} className="hidden justify-self-end sm:inline-flex" />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Effacer : ${l.label}`}
                      disabled={!e}
                      onClick={() => magasin().setPrice(server, l.key, 0)}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="titre-coller" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 id="titre-coller" className="font-semibold">
          Coller une liste de prix
        </h2>
        <p className="text-sm text-muted-foreground">
          Une ligne par prix, par exemple <code className="rounded bg-muted px-1">5 300k</code>,{" "}
          <code className="rounded bg-muted px-1">gen 9 2,4M</code>, <code className="rounded bg-muted px-1">neurone 25000</code>,{" "}
          <code className="rounded bg-muted px-1">optimakina 6 150k</code>, <code className="rounded bg-muted px-1">geneton 3000</code>.
        </p>
        <label className="sr-only" htmlFor="zone-collage">
          Liste de prix à coller
        </label>
        <textarea
          id="zone-collage"
          rows={4}
          className={cn(champ, "h-auto py-2 font-mono")}
          placeholder={"5 300k\n6 520k\nneurone 25k"}
          value={collage}
          onChange={(e) => setCollage(e.target.value)}
        />
        <Button
          className="self-start"
          disabled={!collage.trim()}
          onClick={() => {
            const r = magasin().importPaste(server, collage);
            setMessage({
              ok: r.bad.length === 0,
              texte: `${r.ok} prix importé${r.ok > 1 ? "s" : ""} sur ${server}` + (r.bad.length ? `, ${r.bad.length} ligne(s) ignorée(s) : ${r.bad.slice(0, 3).join(" | ")}` : "."),
            });
            if (r.ok) setCollage("");
          }}
        >
          <ClipboardPaste aria-hidden /> Importer ce texte
        </Button>
      </section>

      <section aria-labelledby="titre-sauvegarde" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 id="titre-sauvegarde" className="font-semibold">
          Sauvegarde et anciens prix (v2)
        </h2>
        <p className="text-sm text-muted-foreground">
          Tes prix restent dans ce navigateur : exporte-les de temps en temps, et pour passer d&apos;un appareil à
          l&apos;autre.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={demo}
            onClick={() =>
              telechargerJson(`dragodindes-prix-${new Date().toISOString().slice(0, 10)}.json`, magasin().exportJSON())
            }
          >
            <Download aria-hidden /> Exporter tout (JSON)
          </Button>
          <Button variant="outline" disabled={importBloque} onClick={() => fichier.current?.click()}>
            <Upload aria-hidden /> Importer un JSON
          </Button>
          <input
            ref={fichier}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Fichier JSON à importer"
            disabled={importBloque}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importerFichier(f);
            }}
          />
        </div>
        {demo && <p className="text-xs text-muted-foreground">Export et import indisponibles en mode démo.</p>}
        {futureVersion && (
          <p className="text-xs text-warning">Import désactivé : une version plus récente de l&apos;appli a été utilisée ici. Recharge la page.</p>
        )}
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="font-medium">Tu viens de l&apos;ancienne version (v2) ?</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
            <li>
              Ouvre la v2 là où tu l&apos;utilisais (le fichier <code>index.html</code> sur ton PC ; au besoin, elle est
              archivée{" "}
              <a href={LIEN_V2} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">
                sur GitHub
              </a>
              ).
            </li>
            <li>Onglet Rentabilité → « Coller une liste de prix / export / import » → « Exporter tout (JSON) ».</li>
            <li>Ici, « Importer un JSON » et choisis ce fichier : prix datés, serveur et réglages sont repris.</li>
          </ol>
          <p className="mt-1 text-xs text-muted-foreground">
            Si tu utilisais la v2 sur ce même site, tes données ont été reprises automatiquement.
          </p>
        </div>
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>
            {message.texte}
          </p>
        )}
      </section>
    </div>
  );
}
