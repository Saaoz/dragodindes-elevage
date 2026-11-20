"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarPlus, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choix } from "@/components/commun/choix";
import { VisageIcone } from "@/components/commun/visage";
import { EnclosForm } from "@/components/enclos/enclos-form";
import { IconeJauge } from "@/components/enclos/icone-jauge";
import {
  brouillonDe,
  formatDuree,
  formatHeure,
  formatNombre,
  formatSerenite,
  heureRappel,
  libelleMarge,
  visageDe,
  type Objectif,
  type VueEnclos,
} from "@/lib/enclos";
import { construireIcs, lienGoogleAgenda, nomFichierIcs, type EvenementAgenda } from "@/lib/ics";
import { CAPACITE_JAUGE } from "@/lib/data";
import type { Enclos } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { MESSAGES_INDISPO } from "@/lib/push/client";
import type { EtatPush } from "@/components/enclos/use-push";

export interface PushCarte {
  etat: EtatPush;
  enCours: boolean;
  note: string | null;
  /* mode démo : aucune notification n'est planifiée */
  demo: boolean;
  onActiver: () => void;
  onAnnuler: () => void;
}

type Permission = NotificationPermission | "indisponible";

function evenementAgenda(enclos: Enclos, vue: VueEnclos, maintenantMs: number, margeMin: number): EvenementAgenda | null {
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
    debutMs: heureRappel(vue.retour.quandMs, margeMin, maintenantMs),
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

const OBJECTIFS: { valeur: Objectif; label: string }[] = [
  { valeur: "aucun", label: "Éviter ±5 000" },
  { valeur: "maturite", label: "Rester en Maturité" },
];

export function EnclosCard({
  enclos,
  vue,
  maintenantMs,
  premier,
  margeMin,
  onObjectif,
  onSave,
  onClear,
  push,
}: {
  enclos: Enclos;
  vue: VueEnclos;
  maintenantMs: number;
  premier: boolean;
  margeMin: number;
  onObjectif: (o: Objectif) => void;
  onSave: (e: Enclos) => void;
  onClear: () => void;
  push: PushCarte;
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

  const evt = evenementAgenda(enclos, vue, maintenantMs, margeMin);

  const activerRappel = async () => {
    if (!retour) return;
    if (typeof Notification === "undefined") {
      setPermission("indisponible");
      return;
    }
    let p: NotificationPermission = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") setRappelA(heureRappel(retour.quandMs, margeMin, Date.now()));
  };

  const serenites = plan.etat.serenites;
  const sMin = Math.min(...serenites);
  const sMax = Math.max(...serenites);

  return (
    <section
      id={`enclos-${vue.index + 1}`}
      tabIndex={-1}
      aria-label={nom}
      className={cn(
        "flex scroll-mt-20 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        saisi && urgent && "border-destructive/60",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{nom}</h2>
          {premier && retour && (
            <span className="mt-0.5 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              Le plus urgent
            </span>
          )}
        </div>
        {!edition && (
          <Button variant={saisi ? "outline" : "default"} onClick={() => setEdition(true)}>
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
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg p-3",
                urgent ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              <Clock className={cn("mt-1 size-5 shrink-0", urgent ? "text-destructive" : "text-primary")} aria-hidden />
              <div>
                <p className="text-2xl leading-tight font-bold">
                  {depasse ? "Retour dépassé" : `Reviens avant ${formatHeure(retour.quandMs, maintenantMs)}`}
                </p>
                <p className={cn("text-sm", urgent ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {depasse ? `depuis ${formatDuree(-(reste ?? 0))}` : `dans ${formatDuree(reste ?? 0)}`}
                  {" · "}
                  {retour.evenement.type === "jaugeVide"
                    ? "jauge de sérénité vide à ce moment-là"
                    : retour.evenement.type === "sortieZone"
                      ? "une monture sort de la zone Maturité"
                      : "une monture atteint ±5 000"}
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Aucune jauge de sérénité active : rien ne bouge, pas d&apos;heure de retour à prévoir.
            </p>
          )}

          {alerte && (
            <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>Alerte</strong> : la monture {alerte.monture + 1} atteindra {formatSerenite(alerte.valeur)} à{" "}
                {formatHeure(alerte.quandMs, maintenantMs)}. Si tu reviens plus tard, {formatNombre(alerte.gaspille)} points
                de jauge sont gaspillés pour elle.
              </span>
            </p>
          )}

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">
              Sérénité estimée maintenant : {formatSerenite(sMin)}
              {sMin !== sMax && ` à ${formatSerenite(sMax)}`}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Sérénité estimée de chaque monture">
              {serenites.map((s, i) => {
                const v = visageDe(s);
                return (
                  <li key={i} className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs">
                    <VisageIcone id={v.id} className="size-5" />
                    <span className="sr-only">visage {v.nom.toLowerCase()},</span>
                    <span className="text-muted-foreground">M{i + 1}</span>
                    <span className="font-medium tabular-nums">{formatSerenite(s)}</span>
                  </li>
                );
              })}
            </ul>
            {plan.etat.sens && (
              <p className="text-muted-foreground">
                Jauge Sérénité {plan.etat.sens === "+" ? "+" : "−"} : {formatNombre(plan.etat.niveauJauge)} /{" "}
                {formatNombre(CAPACITE_JAUGE)} (estimé)
              </p>
            )}
            {enclos.autreJauge && vue.autreVideMs !== null && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <IconeJauge jauge={enclos.autreJauge} />
                Jauge {enclos.autreJauge} vide à {formatHeure(vue.autreVideMs, maintenantMs)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-medium" id={`objectif-${vue.index}`}>
                Objectif
              </span>
              <Choix
                label={`Objectif de ${nom}`}
                taille="sm"
                valeur={enclos.objectif}
                onChange={onObjectif}
                options={OBJECTIFS}
              />
            </div>
            {plan.aRemplir.message && <p>{plan.aRemplir.message}</p>}
            {plan.aRemplir.statut === "tropEcartees" && plan.aRemplir.groupes && (
              <p className="text-warning">
                Regroupement conseillé :{" "}
                {plan.aRemplir.groupes.map((g) => `enclos ${g.map((i) => `M${i + 1}`).join(" + ")}`).join(" / ")}.
              </p>
            )}
          </div>

          {evt && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <BellRing className="size-4 text-primary" aria-hidden />
                Rappel {libelleMarge(margeMin)} l&apos;heure de retour, soit à{" "}
                {formatHeure(heureRappel(retour!.quandMs, margeMin, maintenantMs), maintenantMs)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => telecharger(nomFichierIcs(`retour-${nom}`), construireIcs(evt))}>
                  <CalendarPlus aria-hidden /> Ajouter à mon agenda
                </Button>
                <a
                  href={lienGoogleAgenda(evt)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/20"
                >
                  Google Agenda
                </a>
                <Button variant="outline" onClick={activerRappel} disabled={rappelA !== null}>
                  {rappelA !== null ? `Prévenu ici à ${formatHeure(rappelA, maintenantMs)}` : "Me prévenir dans cet onglet"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                « Dans cet onglet » : seulement tant que l&apos;onglet reste ouvert (perdu au rechargement).
                {permission === "denied" && " Notifications bloquées par ton navigateur."}
                {permission === "indisponible" && " Les notifications ne sont pas disponibles sur ce navigateur."}
              </p>
              <BlocPush push={push} rappel={enclos.rappel} maintenantMs={maintenantMs} />
            </div>
          )}

          <div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear}>
              Vider cet enclos
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/* Notification push à l'heure de retour, même onglet fermé (#16), avec repli explicite sur l'agenda. */
function BlocPush({
  push,
  rappel,
  maintenantMs,
}: {
  push: PushCarte;
  rappel: Enclos["rappel"];
  maintenantMs: number;
}) {
  const { etat, enCours, note, demo } = push;
  const prevu = !demo && rappel !== null && rappel.at > maintenantMs;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2.5" data-testid="bloc-push">
      {prevu ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium" role="status">
            Notification prévue à {formatHeure(rappel.at, maintenantMs)} sur ce téléphone
          </p>
          <Button size="sm" variant="ghost" onClick={push.onAnnuler}>
            Annuler la notification
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={push.onActiver}
          disabled={demo || etat.statut !== "pret" || enCours}
        >
          {enCours ? "Planification…" : "Recevoir une notification sur ce téléphone"}
        </Button>
      )}
      {demo ? (
        <p className="text-xs text-muted-foreground">Pas de notification en mode démo.</p>
      ) : (
        <>
          {etat.statut === "indisponible" && (
            <p className="text-xs text-warning">
              {MESSAGES_INDISPO[etat.raison]} Utilise plutôt « Ajouter à mon agenda » : l&apos;alarme de ton agenda
              sonnera à l&apos;heure.
            </p>
          )}
          {etat.statut === "pret" && !prevu && (
            <p className="text-xs text-muted-foreground">
              {etat.abonne
                ? "Notifications activées sur cet appareil : chaque saisie planifie automatiquement son rappel."
                : "Tu seras prévenu à l’heure du rappel, même onglet fermé ou téléphone en poche."}
            </p>
          )}
        </>
      )}
      {note && (
        <p className="text-xs text-warning" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
