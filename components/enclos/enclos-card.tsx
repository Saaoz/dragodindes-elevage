"use client";

import { useEffect, useState } from "react";
import { BellRing, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choix } from "@/components/commun/choix";
import { VisageIcone } from "@/components/commun/visage";
import { EnclosForm } from "@/components/enclos/enclos-form";
import { IconeJauge } from "@/components/enclos/icone-jauge";
import {
  brouillonDe,
  CONSEIL_RETARD,
  formatDuree,
  formatHeure,
  formatNombre,
  formatSerenite,
  heureRappel,
  raisonRetour,
  texteAlerte,
  visageDe,
  type Objectif,
  type VueEnclos,
} from "@/lib/enclos";
import { construireIcs, lienGoogleAgenda, nomFichierIcs, type EvenementAgenda } from "@/lib/ics";
import { CAPACITE_JAUGE } from "@/lib/data";
import type { Enclos } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { ChoixRappel } from "@/components/enclos/choix-rappel";
import { LIBELLE_ETAT, methodeAUtiliser, type MethodeRappel } from "@/lib/rappel";

export interface RappelCarte {
  /* mode démo : aucun rappel réel n'est programmé */
  demo: boolean;
  /* méthode mémorisée, et méthodes utilisables sur cet appareil (la meilleure d'abord) */
  methode: MethodeRappel | null;
  methodes: readonly MethodeRappel[];
  /* phrase simple expliquant pourquoi la notification sur le téléphone manque */
  sansPush: string | null;
  enCours: boolean;
  note: string | null;
  onMethode: (m: MethodeRappel) => void;
  /* planifie la notification push ; renvoie l'heure d'envoi, ou null si elle n'a pas pu être programmée */
  onPush: () => Promise<number | null>;
  onAnnulerPush: () => void;
  /* l'autorisation de notifier est celle du navigateur : relue après chaque demande */
  onPermission: (p: Permission) => void;
}

export type Permission = NotificationPermission | "indisponible";

function evenementAgenda(enclos: Enclos, vue: VueEnclos, maintenantMs: number, margeMin: number): EvenementAgenda | null {
  /* heure de retour passée : aucun rappel ni agenda dans le passé (#31) */
  if (!vue.retour || vue.retardS !== null) return null;
  const nom = enclos.nom || `Enclos ${vue.index + 1}`;
  const avant = formatHeure(vue.retour.quandMs, maintenantMs);
  const lignes = [`Reviens à « ${nom} » avant ${avant}.`];
  if (vue.alerte)
    lignes.push(`Une monture atteindra ${formatSerenite(vue.alerte.valeur)} : après, ${formatNombre(vue.alerte.gaspille)} points de jauge seraient gaspillés.`);
  if (vue.conseil) lignes.push(vue.conseil);
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
  rappel: reglageRappel,
}: {
  enclos: Enclos;
  vue: VueEnclos;
  maintenantMs: number;
  premier: boolean;
  margeMin: number;
  onObjectif: (o: Objectif) => void;
  onSave: (e: Enclos) => void;
  onClear: () => void;
  rappel: RappelCarte;
}) {
  const nom = enclos.nom || `Enclos ${vue.index + 1}`;
  const [edition, setEdition] = useState(false);
  /* Dernier rappel programmé depuis cette carte (agenda, page) ou push ; le push survit au rechargement via `enclos.rappel`. */
  const [fait, setFait] = useState<{ methode: MethodeRappel; at: number } | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [annonce, setAnnonce] = useState("");
  const [confirmeVider, setConfirmeVider] = useState(false);
  const saisi = enclos.saisieLe !== null;
  const { retour, alerte, plan } = vue;
  const reste = retour ? (retour.quandMs - maintenantMs) / 1000 : null;
  const depasse = vue.retardS !== null;
  const raison = raisonRetour(vue, maintenantMs) ?? "";
  const jaugeVidee = vue.jaugeVideMs !== null && vue.jaugeVideMs <= maintenantMs;
  const urgent = alerte !== null || (reste !== null && reste < 900);

  /* Rappel « dans la page » : setTimeout, perdu si la page est fermée ou rechargée. */
  const rappelPageA = fait?.methode === "page" ? fait.at : null;
  useEffect(() => {
    if (rappelPageA === null) return;
    const id = setTimeout(
      () => {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification(`${nom} : reviens maintenant`, { body: `Reviens à l'enclos avant que des points de sérénité soient gaspillés.`, tag: `enclos-${vue.index}` });
        } catch {
          /* certains navigateurs mobiles exigent un service worker : on abandonne en silence */
        }
        setFait(null);
      },
      Math.max(0, rappelPageA - Date.now()),
    );
    return () => clearTimeout(id);
  }, [rappelPageA, nom, vue.index]);

  const evt = evenementAgenda(enclos, vue, maintenantMs, margeMin);
  const heureRappelMs = retour ? heureRappel(retour.quandMs, margeMin, maintenantMs) : 0;
  const heure = formatHeure(heureRappelMs, maintenantMs);

  /* État affiché sous le bouton : le dernier rappel fait ici, sinon le push planifié (persisté), tant que l'heure n'est pas passée. */
  const pushPrevu = !reglageRappel.demo && enclos.rappel !== null && enclos.rappel.at > maintenantMs;
  const etat: { methode: MethodeRappel; at: number } | null =
    fait && fait.at > maintenantMs ? fait : pushPrevu ? { methode: "push", at: enclos.rappel!.at } : null;

  const programmer = async (m: MethodeRappel) => {
    if (!retour || !evt) return;
    const programme = (at: number) => {
      setFait({ methode: m, at });
      setAnnonce(`Rappel programmé à ${formatHeure(at, Date.now())}`);
    };
    if (m === "push") {
      const at = await reglageRappel.onPush();
      if (at !== null) programme(at);
      else setAnnonce("");
    } else if (m === "agenda") {
      telecharger(nomFichierIcs(`retour-${nom}`), construireIcs(evt));
      programme(heureRappelMs);
    } else if (m === "google") {
      window.open(lienGoogleAgenda(evt), "_blank", "noopener,noreferrer");
      programme(heureRappelMs);
    } else {
      if (typeof Notification === "undefined") return reglageRappel.onPermission("indisponible");
      let p: NotificationPermission = Notification.permission;
      if (p === "default") p = await Notification.requestPermission();
      reglageRappel.onPermission(p);
      if (p === "granted") programme(heureRappel(retour.quandMs, margeMin, Date.now()));
    }
  };

  /* Un seul appui si la méthode mémorisée marche encore ici ; sinon (ou « changer ») le choix s'ouvre. */
  const methodeMemorisee = methodeAUtiliser(reglageRappel.methode, reglageRappel.methodes);
  const appuyer = () => {
    if (reglageRappel.demo) return setAnnonce("Mode démo : aucun rappel réel n’est programmé. Quitte la démo pour en programmer un.");
    if (methodeMemorisee === null) return setChoixOuvert(true);
    void programmer(methodeMemorisee);
  };
  const confirmer = (m: MethodeRappel) => {
    setChoixOuvert(false);
    reglageRappel.onMethode(m);
    void programmer(m);
  };
  const annulerRappel = () => {
    setChoixOuvert(false);
    if (pushPrevu) reglageRappel.onAnnulerPush();
    setFait(null);
    setAnnonce("Rappel annulé");
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
            setFait(null);
            setAnnonce("");
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
                  {depasse
                    ? `Retour dépassé depuis ${formatDuree(vue.retardS ?? 0)}`
                    : `Reviens avant ${formatHeure(retour.quandMs, maintenantMs)}`}
                </p>
                <p className={cn("text-sm", urgent ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {depasse
                    ? `${raison.charAt(0).toUpperCase()}${raison.slice(1)}.`
                    : `dans ${formatDuree(reste ?? 0)} · ${raison}`}
                </p>
                {depasse && <p className="mt-1 text-sm">{CONSEIL_RETARD}</p>}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              {plan.etat.sens
                ? "Jauge de sérénité vide à la saisie : rien ne bouge, pas d’heure de retour à prévoir."
                : "Aucune jauge de sérénité active : rien ne bouge, pas d’heure de retour à prévoir."}
            </p>
          )}

          {alerte && (
            <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>Alerte</strong> : {texteAlerte(alerte, maintenantMs)}
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
                Jauge Sérénité {plan.etat.sens === "+" ? "+" : "−"} :{" "}
                {jaugeVidee
                  ? `vide depuis ${formatHeure(vue.jaugeVideMs!, maintenantMs)}`
                  : `${formatNombre(plan.etat.niveauJauge)} / ${formatNombre(CAPACITE_JAUGE)} (estimé)`}
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
            {vue.conseil && <p>{vue.conseil}</p>}
            {plan.aRemplir.statut === "tropEcartees" && plan.aRemplir.groupes && (
              <p className="text-warning">
                Regroupement conseillé :{" "}
                {plan.aRemplir.groupes.map((g) => `enclos ${g.map((i) => `M${i + 1}`).join(" + ")}`).join(" / ")}.
              </p>
            )}
          </div>

          {evt && (
            <div className="flex flex-col gap-2 border-t pt-3" data-testid="rappel">
              <Button
                size="lg"
                className="h-11 w-full text-base"
                onClick={appuyer}
                aria-label={`Me rappeler à ${heure} pour l’enclos ${nom}`}
              >
                <BellRing aria-hidden /> Me rappeler à {heure}
              </Button>
              {etat ? (
                <p className="flex flex-wrap items-center gap-x-1 text-sm" data-testid="etat-rappel">
                  <span>
                    Rappel : {LIBELLE_ETAT[etat.methode]}, à {formatHeure(etat.at, maintenantMs)} <span aria-hidden>✓</span>
                  </span>
                  <span aria-hidden>·</span>
                  <BoutonChanger nom={nom} onClick={() => setChoixOuvert(true)} />
                </p>
              ) : (
                methodeMemorisee !== null &&
                !reglageRappel.demo && (
                  <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground" data-testid="methode-rappel">
                    <span>Façon de te rappeler : {LIBELLE_ETAT[methodeMemorisee]}</span>
                    <span aria-hidden>·</span>
                    <BoutonChanger nom={nom} onClick={() => setChoixOuvert(true)} />
                  </p>
                )
              )}
              {reglageRappel.enCours && <p className="text-sm text-muted-foreground">Programmation du rappel…</p>}
              {reglageRappel.note && <p className="text-sm text-warning">{reglageRappel.note}</p>}
              {/* annonce vocale : la zone existe avant son contenu pour que le lecteur d'écran la lise ; en démo elle se voit aussi */}
              <p
                role="status"
                aria-live="polite"
                className={reglageRappel.demo && annonce ? "text-sm text-muted-foreground" : "sr-only"}
                data-testid="annonce-rappel"
              >
                {annonce}
              </p>
              <ChoixRappel
                open={choixOuvert}
                onOpenChange={setChoixOuvert}
                nom={nom}
                heure={heure}
                methodes={reglageRappel.methodes}
                initiale={methodeMemorisee ?? reglageRappel.methodes[0] ?? "agenda"}
                sansPush={reglageRappel.sansPush}
                rappelActif={etat !== null}
                onConfirmer={confirmer}
                onAnnulerRappel={annulerRappel}
              />
            </div>
          )}

          {confirmeVider ? (
            <div role="group" aria-label={`Vider ${nom}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 p-2.5 text-sm">
              <p className="mr-auto">Vider {nom} ? La saisie et le rappel prévu seront perdus.</p>
              <Button
                size="sm"
                variant="outline"
                autoFocus
                onClick={() => setConfirmeVider(false)}
              >
                Garder
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirmeVider(false);
                  onClear();
                }}
              >
                Oui, vider
              </Button>
            </div>
          ) : (
            <div>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmeVider(true)}>
                Vider cet enclos
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* « changer » : cible d'au moins 44 px, nom complet pour le lecteur d'écran. */
function BoutonChanger({ nom, onClick }: { nom: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Changer la façon d’être rappelé pour l’enclos ${nom}`}
      className="inline-flex min-h-11 items-center rounded-md px-2 text-primary underline underline-offset-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      changer
    </button>
  );
}
