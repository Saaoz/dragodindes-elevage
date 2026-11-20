"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ICONES_JAUGE, champ, EnclosForm } from "@/components/enclos/enclos-form";
import {
  brouillonDe,
  formatDuree,
  formatHeure,
  formatNombre,
  formatSerenite,
  MARGE_RETOUR_S,
  visageDe,
  type Objectif,
  type VueEnclos,
} from "@/lib/enclos";
import { construireIcs, lienGoogleAgenda, nomFichierIcs, type EvenementAgenda } from "@/lib/ics";
import { CAPACITE_JAUGE } from "@/lib/data";
import type { Enclos } from "@/lib/schema";
import { cn } from "@/lib/utils";

type Permission = NotificationPermission | "indisponible";

function evenementAgenda(enclos: Enclos, vue: VueEnclos, maintenantMs: number): EvenementAgenda | null {
  if (!vue.retour) return null;
  const nom = enclos.nom || `Enclos ${vue.index + 1}`;
  const avant = formatHeure(vue.retour.quandMs, maintenantMs);
  const lignes = [`Reviens à « ${nom} » avant ${avant}.`];
  if (vue.alerte)
    lignes.push(`Une monture atteindra ${formatSerenite(vue.alerte.valeur)} : après, ${formatNombre(vue.alerte.gaspille)} points de jauge seraient gaspillés.`);
  if (vue.plan.aRemplir.message) lignes.push(vue.plan.aRemplir.message);
  return {
    uid: `enclos-${vue.index + 1}@dragodindes-elevage`,
    titre: `${nom} : reviens avant ${avant}`,
    description: lignes.join("\n"),
    debutMs: Math.max(vue.retour.quandMs - MARGE_RETOUR_S * 1000, maintenantMs),
    dureeMin: 10,
    alarmeMin: 0,
    maintenantMs,
  };
}

function telecharger(nomFichier: string, contenu: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EnclosCard({
  enclos,
  vue,
  maintenantMs,
  premier,
  objectif,
  onObjectif,
  onSave,
  onClear,
}: {
  enclos: Enclos;
  vue: VueEnclos;
  maintenantMs: number;
  premier: boolean;
  objectif: Objectif;
  onObjectif: (o: Objectif) => void;
  onSave: (e: Enclos) => void;
  onClear: () => void;
}) {
  const nom = enclos.nom || `Enclos ${vue.index + 1}`;
  const [edition, setEdition] = useState(false);
  const [rappelA, setRappelA] = useState<number | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const saisi = enclos.saisieLe !== null;
  const { retour, alerte, plan } = vue;
  const reste = retour ? (retour.quandMs - maintenantMs) / 1000 : null;
  const depasse = reste !== null && reste <= 0;
  const urgent = alerte !== null || (reste !== null && reste < 900);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'API Notification n'existe que dans le navigateur
    setPermission(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
  }, []);

  /* Rappel local : setTimeout, perdu si l'onglet est fermé ou rechargé. */
  useEffect(() => {
    if (rappelA === null) return;
    const id = setTimeout(
      () => {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification(`${nom} : reviens maintenant`, { body: `Reviens à l'enclos avant que des points de sérénité soient gaspillés.`, tag: `enclos-${vue.index}` });
        } catch {
          /* certains navigateurs mobiles exigent un service worker : on abandonne en silence */
        }
        setRappelA(null);
      },
      Math.max(0, rappelA - Date.now()),
    );
    return () => clearTimeout(id);
  }, [rappelA, nom, vue.index]);

  const evt = evenementAgenda(enclos, vue, maintenantMs);

  const activerRappel = async () => {
    if (!retour) return;
    if (typeof Notification === "undefined") {
      setPermission("indisponible");
      return;
    }
    let p: NotificationPermission = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") setRappelA(retour.quandMs - MARGE_RETOUR_S * 1000);
  };

  return (
    <section
      aria-label={nom}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground",
        urgent && "border-red-500/60",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{nom}</h2>
          {premier && retour && <span className="text-xs font-medium text-red-700 dark:text-red-300">Le plus urgent</span>}
        </div>
        {!edition && (
          <Button variant={saisi ? "outline" : "default"} size="sm" onClick={() => setEdition(true)}>
            {saisi ? "Je quitte l’enclos" : "Saisir cet enclos"}
          </Button>
        )}
      </header>

      {edition ? (
        <EnclosForm
          initial={brouillonDe(enclos, saisi ? plan.etat : undefined)}
          onSave={(e) => {
            setRappelA(null);
            onSave(e);
            setEdition(false);
          }}
          onCancel={() => setEdition(false)}
        />
      ) : !saisi ? (
        <p className="text-sm text-muted-foreground">Pas encore saisi : renseigne-le au moment où tu quittes l&apos;enclos.</p>
      ) : (
        <>
          {retour ? (
            <div>
              <p className="text-2xl font-bold">
                {depasse ? "Retour dépassé" : `Reviens avant ${formatHeure(retour.quandMs, maintenantMs)}`}
              </p>
              <p className={cn("text-sm", urgent ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                {depasse
                  ? `depuis ${formatDuree(-(reste ?? 0))}`
                  : `dans ${formatDuree(reste ?? 0)}`}
                {" · "}
                {retour.evenement.type === "jaugeVide"
                  ? "jauge de sérénité vide à ce moment-là"
                  : retour.evenement.type === "sortieZone"
                    ? "une monture sort de la zone Maturité"
                    : "une monture atteint ±5 000"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune jauge de sérénité active : rien ne bouge, pas d&apos;heure de retour à prévoir.
            </p>
          )}

          {alerte && (
            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-700 dark:text-red-300">
              Alerte : la monture {alerte.monture + 1} atteindra {formatSerenite(alerte.valeur)} à{" "}
              {formatHeure(alerte.quandMs, maintenantMs)}. Si tu reviens plus tard, {formatNombre(alerte.gaspille)} points de
              jauge sont gaspillés pour elle.
            </p>
          )}

          <div className="text-sm">
            <p className="font-medium">
              Sérénité estimée maintenant :{" "}
              {formatSerenite(Math.min(...plan.etat.serenites))}
              {Math.min(...plan.etat.serenites) !== Math.max(...plan.etat.serenites) &&
                ` à ${formatSerenite(Math.max(...plan.etat.serenites))}`}
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {plan.etat.serenites.map((s, i) => (
                <li key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  <span className="font-mono font-bold">{visageDe(s).texte}</span> M{i + 1} {formatSerenite(s)}
                </li>
              ))}
            </ul>
            {plan.etat.sens && (
              <p className="mt-1 text-muted-foreground">
                Jauge Sérénité {plan.etat.sens === "+" ? "+" : "−"} : {formatNombre(plan.etat.niveauJauge)} /{" "}
                {formatNombre(CAPACITE_JAUGE)} (estimé)
              </p>
            )}
            {enclos.autreJauge && vue.autreVideMs !== null && (
              <p className="text-muted-foreground">
                Jauge {enclos.autreJauge} {ICONES_JAUGE[enclos.autreJauge]} vide à {formatHeure(vue.autreVideMs, maintenantMs)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              Objectif
              <select
                className={cn(champ, "w-auto")}
                value={objectif}
                onChange={(e) => onObjectif(e.target.value as Objectif)}
              >
                <option value="aucun">Éviter ±5 000</option>
                <option value="maturite">Rester en Maturité (−2 000 à +2 000)</option>
              </select>
            </label>
            {plan.aRemplir.message && <p>{plan.aRemplir.message}</p>}
            {plan.aRemplir.statut === "tropEcartees" && plan.aRemplir.groupes && (
              <p className="text-amber-700 dark:text-amber-300">
                Regroupement conseillé :{" "}
                {plan.aRemplir.groupes.map((g) => `enclos ${g.map((i) => `M${i + 1}`).join(" + ")}`).join(" / ")}.
              </p>
            )}
          </div>

          {evt && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => telecharger(nomFichierIcs(`retour-${nom}`), construireIcs(evt))}>
                  Ajouter à mon agenda
                </Button>
                <a
                  href={lienGoogleAgenda(evt)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                >
                  Google Agenda
                </a>
                <Button size="sm" variant="outline" onClick={activerRappel} disabled={rappelA !== null}>
                  {rappelA !== null ? `Rappel ici à ${formatHeure(rappelA, maintenantMs)}` : "Me prévenir ici"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                « Me prévenir ici » ne marche que si l&apos;onglet reste ouvert — pour le téléphone, utilise l&apos;agenda.
                {permission === "denied" && " Les notifications sont bloquées par ton navigateur."}
                {permission === "indisponible" && " Les notifications ne sont pas disponibles sur ce navigateur."}
              </p>
            </div>
          )}

          <div>
            <Button variant="ghost" size="xs" onClick={onClear}>
              Vider cet enclos
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
