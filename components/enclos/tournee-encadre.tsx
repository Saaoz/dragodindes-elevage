"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoixRappel } from "@/components/enclos/choix-rappel";
import { telecharger, type Permission } from "@/components/enclos/enclos-card";
import { cleTournee, ESPACE_INSECABLE, evenementTournee, formatHeure, heureRappel, type Tournee, type VueEnclos } from "@/lib/enclos";
import { construireIcs, lienGoogleAgenda, nomFichierIcs } from "@/lib/ics";
import { LIBELLE_ETAT, methodeAUtiliser, type MethodeRappel } from "@/lib/rappel";
import type { RappelTournee } from "@/lib/schema";

export interface RappelTourneeReglage {
  /* mode démo : aucun rappel réel n'est programmé */
  demo: boolean;
  methode: MethodeRappel | null;
  methodes: readonly MethodeRappel[];
  onMethode: (m: MethodeRappel) => void;
  /* rappel agenda / Google mémorisé (rechargement compris) ; null si aucun */
  programme: RappelTournee | null;
  /* mémorise le rappel ; false si rien n'a pu être écrit */
  onProgramme: (r: RappelTournee) => boolean;
  onAnnuler: () => void;
  onPermission: (p: Permission) => void;
}

/* Encadré « Prochaine tournée » (#65) : le plus urgent et les enclos à revoir dans la foulée, avec UN seul rappel.
   Rendu seulement s'il y a au moins deux enclos dans la tournée (le panneau décide). */
export function TourneeEncadre({
  tournee,
  nom,
  maintenantMs,
  margeMin,
  rappel: reglage,
  onAnnonce,
}: {
  tournee: Tournee;
  nom: (v: VueEnclos) => string;
  maintenantMs: number;
  margeMin: number;
  rappel: RappelTourneeReglage;
  /* annonce vocale polie (région aria-live du panneau) */
  onAnnonce: (texte: string) => void;
}) {
  const cle = cleTournee(tournee, margeMin);
  const evt = evenementTournee(tournee, nom, margeMin, maintenantMs);
  const heureRappelMs = heureRappel(tournee.debutMs, margeMin, maintenantMs);
  const heure = formatHeure(heureRappelMs, maintenantMs);
  const [fait, setFait] = useState<{ cle: string; at: number } | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [annonce, setAnnonce] = useState("");
  const boutonRef = useRef<HTMLButtonElement>(null);
  const changerRef = useRef<HTMLButtonElement>(null);
  const focusPris = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (choixOuvert) focusPris.current = false;
  }, [choixOuvert]);
  useEffect(() => {
    if (focusTick > 0) (changerRef.current ?? boutonRef.current)?.focus();
  }, [focusTick]);

  /* Rappel « dans la page » : setTimeout, perdu si la page est fermée ou rechargée. */
  const rappelPageA = fait && fait.cle === cle ? fait.at : null;
  useEffect(() => {
    if (rappelPageA === null) return;
    const id = setTimeout(
      () => {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification("Tournée des enclos : passe maintenant", { body: "Plusieurs enclos sont à revoir dans la foulée.", tag: "tournee" });
        } catch {
          /* certains navigateurs mobiles exigent un service worker : on abandonne en silence */
        }
        setFait(null);
      },
      Math.max(0, rappelPageA - Date.now()),
    );
    return () => clearTimeout(id);
  }, [rappelPageA]);

  /* Programmé pour CETTE tournée : « dans la page » (état local), sinon celui mémorisé. Si la composition, l'heure
     ou la marge ont changé, le rappel mémorisé est obsolète (son événement d'agenda reste à supprimer à la main). */
  const memo = !reglage.demo ? reglage.programme : null;
  const memoValide = memo !== null && memo.cle === cle ? memo : null;
  const etat: { methode: MethodeRappel; at: number } | null =
    fait && fait.cle === cle && fait.at > maintenantMs
      ? { methode: "page", at: fait.at }
      : memoValide !== null
        ? { methode: memoValide.methode, at: memoValide.at }
        : null;
  const ancien = memo !== null && memo.cle !== cle && memo.at > maintenantMs ? memo : null;

  const programmer = async (m: MethodeRappel): Promise<boolean> => {
    if (!evt) return false;
    const programme = (at: number) => {
      setAnnonce(`Rappel de la tournée programmé à ${formatHeure(at, Date.now())}`);
      return true;
    };
    if (m === "agenda" || m === "google") {
      if (m === "agenda") telecharger(nomFichierIcs("tournee-des-enclos"), construireIcs(evt));
      else window.open(lienGoogleAgenda(evt), "_blank", "noopener,noreferrer");
      if (!reglage.onProgramme({ methode: m, at: heureRappelMs, cle })) setFait({ cle, at: heureRappelMs });
      return programme(heureRappelMs);
    }
    if (typeof Notification === "undefined") {
      reglage.onPermission("indisponible");
      return false;
    }
    let p: NotificationPermission = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    reglage.onPermission(p);
    if (p !== "granted") return false;
    const at = heureRappel(tournee.debutMs, margeMin, Date.now());
    setFait({ cle, at });
    return programme(at);
  };
  const lancer = async (m: MethodeRappel) => {
    await programmer(m);
    setFocusTick((t) => t + 1);
  };

  const methodeMemorisee = methodeAUtiliser(reglage.methode, reglage.methodes);
  const appuyer = () => {
    if (reglage.demo) return setAnnonce("Mode démo : aucun rappel réel n’est programmé. Quitte la démo pour en programmer un.");
    if (methodeMemorisee === null) return setChoixOuvert(true);
    void lancer(methodeMemorisee);
  };
  const confirmer = (m: MethodeRappel) => {
    focusPris.current = true;
    setChoixOuvert(false);
    reglage.onMethode(m);
    void lancer(m);
  };
  const annulerRappel = () => {
    focusPris.current = true;
    setChoixOuvert(false);
    if (memoValide !== null) reglage.onAnnuler();
    setFait(null);
    setAnnonce("Rappel de la tournée annulé");
    onAnnonce("Rappel de la tournée annulé.");
    setFocusTick((t) => t + 1);
  };

  const n = tournee.membres.length;
  return (
    <section aria-labelledby="titre-tournee" data-testid="tournee" className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
      <h2 id="titre-tournee" className="flex items-center gap-2 text-base font-semibold">
        <Route className="size-4 text-primary" aria-hidden /> Prochaine tournée
      </h2>
      <p data-testid="tournee-resume">
        <strong>{tournee.immediat ? "Passe maintenant" : `Passe à ${formatHeure(tournee.debutMs, maintenantMs)}`}</strong>
        {` : ${n}${ESPACE_INSECABLE}enclos`}
        {tournee.immediat ? " à revoir dans la foulée." : ", un seul passage suffit."}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground" aria-label="Enclos de la tournée">
        {tournee.membres.map((v) => (
          <li key={v.index}>
            <span className="font-medium text-foreground">{nom(v)}</span>{" "}
            {v.aFaireMaintenant || v.retardS !== null ? "maintenant" : formatHeure(v.retour!.quandMs, maintenantMs)}
          </li>
        ))}
      </ul>

      {evt && (
        <div className="flex flex-col gap-1" data-testid="rappel-tournee">
          {etat ? (
            <div className="flex flex-wrap items-center gap-x-2 rounded-lg bg-primary/10 px-3 py-1" data-testid="etat-rappel-tournee">
              <p className="font-medium">
                <span aria-hidden>✓ </span>Rappel de la tournée programmé à {formatHeure(etat.at, maintenantMs)} ({LIBELLE_ETAT[etat.methode]})
              </p>
              <BoutonChanger onClick={() => setChoixOuvert(true)} boutonRef={changerRef} />
            </div>
          ) : (
            <>
              <Button ref={boutonRef} size="lg" className="h-11 w-full text-base sm:w-auto" onClick={appuyer} aria-label={`Me rappeler pour la tournée à ${heure}`}>
                <BellRing aria-hidden /> Me rappeler pour la tournée
              </Button>
              <p className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                <span>Un seul rappel à {heure}, les rappels de chaque enclos restent possibles plus bas.</span>
                {methodeMemorisee !== null && !reglage.demo && (
                  <>
                    <span>Façon de te rappeler : {LIBELLE_ETAT[methodeMemorisee]}</span>
                    <span aria-hidden>·</span>
                    <BoutonChanger onClick={() => setChoixOuvert(true)} />
                  </>
                )}
              </p>
            </>
          )}
          <p
            role="status"
            aria-live="polite"
            className={reglage.demo && annonce ? "text-muted-foreground" : "sr-only"}
            data-testid="annonce-rappel-tournee"
          >
            {annonce}
          </p>
          <ChoixRappel
            open={choixOuvert}
            onOpenChange={setChoixOuvert}
            nom="la tournée"
            heure={heure}
            methodes={reglage.methodes}
            initiale={methodeMemorisee ?? reglage.methodes[0] ?? "agenda"}
            rappelActif={etat !== null}
            finalFocus={() => !focusPris.current}
            onConfirmer={confirmer}
            onAnnulerRappel={annulerRappel}
          />
        </div>
      )}

      {ancien && (
        <p className="rounded-lg border border-warning/50 p-2 text-warning" data-testid="ancien-rappel-tournee">
          Pense à supprimer l’ancien rappel de la tournée de {formatHeure(ancien.at, maintenantMs)} dans {ancien.methode === "google" ? "Google Agenda" : "ton agenda"}.
        </p>
      )}
    </section>
  );
}

function BoutonChanger({ onClick, boutonRef }: { onClick: () => void; boutonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={boutonRef}
      type="button"
      onClick={onClick}
      aria-label="Changer la façon d’être rappelé pour la tournée"
      className="inline-flex min-h-11 items-center rounded-md px-2 text-primary underline underline-offset-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      changer
    </button>
  );
}
