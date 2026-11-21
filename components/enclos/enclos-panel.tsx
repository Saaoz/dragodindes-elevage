"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { EnclosCard, type Permission } from "@/components/enclos/enclos-card";
import { magasinActif, useApp, useUi } from "@/components/app-state";
import { BoutonDemo } from "@/components/commun/bouton-demo";
import { Choix } from "@/components/commun/choix";
import { EnTete, Page } from "@/components/commun/en-tete";
import { annonceEnregistre, formatCompteARebours, trierParUrgence, vueEnclos, type Objectif } from "@/lib/enclos";
import { enclosSchema, MARGES_RAPPEL_MIN, type Enclos } from "@/lib/schema";
import { methodesDisponibles } from "@/lib/rappel";

const TITRE = "Mes enclos";

export function EnclosPanel() {
  const pret = useUi((u) => u.pret);
  const demo = useUi((u) => u.demo);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const enclos = useApp((s) => s.enclos);
  const margeMin = useApp((s) => s.reglages.margeRappelMin);
  const methode = useApp((s) => s.reglages.methodeRappel);
  const [permission, setPermission] = useState<Permission>("default");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'API Notification n'existe que dans le navigateur
    setPermission(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
  }, []);
  /* Annonce vocale polie : la région existe avant son contenu, pour que le lecteur d'écran la lise. */
  const [annonce, setAnnonce] = useState("");

  /* Horloge : on recalcule chaque seconde. */
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const vues = useMemo(
    () => trierParUrgence(enclos.map((e, i) => vueEnclos(e, i, maintenant))),
    [enclos, maintenant],
  );

  /* Titre de l'onglet = compte à rebours du prochain événement. */
  const prochain = vues[0]?.retour ?? null;
  useEffect(() => {
    if (!pret) return;
    document.title = prochain
      ? `${prochain.quandMs <= maintenant ? "En retard" : formatCompteARebours((prochain.quandMs - maintenant) / 1000)} · ${enclos[vues[0].index].nom || `Enclos ${vues[0].index + 1}`} · ${TITRE}`
      : TITRE;
  }, [pret, prochain, maintenant, enclos, vues]);
  useEffect(() => () => void (document.title = "Élevage de dragodindes"), []);

  /* Ouvre l'enclos visé par une notification (/enclos#enclos-3), y compris si la page est déjà ouverte. */
  useEffect(() => {
    if (!pret) return;
    const aller = () => {
      const el = /^#enclos-\d$/.test(location.hash) ? document.getElementById(location.hash.slice(1)) : null;
      el?.scrollIntoView({ block: "start" });
      el?.focus({ preventScroll: true });
    };
    aller();
    window.addEventListener("hashchange", aller);
    return () => window.removeEventListener("hashchange", aller);
  }, [pret]);

  const methodes = methodesDisponibles({ notificationPage: permission !== "indisponible" && permission !== "denied" });

  const sauver = (i: number, e: Enclos, annoncer = true) => {
    const magasin = magasinActif().getState();
    /* l'objectif vient de la saisie (#63) : prérempli avec celui de l'enclos, proposé selon l'autre jauge, modifiable */
    if (!magasin.setEnclos(i, e)) return;
    if (annoncer) {
      const nouveau = magasinActif().getState().enclos[i];
      const t = nouveau.saisieLe ?? maintenant;
      setAnnonce(annonceEnregistre(vueEnclos(nouveau, i, t), nouveau.nom || `Enclos ${i + 1}`, t));
    }
  };
  const vider = (i: number) => {
    /* vider garde le nom et l'objectif de l'enclos */
    sauver(i, enclosSchema.parse({ nom: enclos[i].nom, objectif: enclos[i].objectif }), false);
    setAnnonce(`${enclos[i].nom || `Enclos ${i + 1}`} vidé.`);
  };

  const changerObjectif = (i: number, o: Objectif) => {
    const avant = vueEnclos(enclos[i], i, maintenant).retour?.quandMs;
    if (!magasinActif().getState().setObjectif(i, o)) return;
    /* l'heure de retour a changé : le rappel d'agenda programmé ne vaut plus (l'ancien événement est à supprimer à la main) */
    const e = magasinActif().getState().enclos[i];
    if (e.rappel && vueEnclos(e, i, maintenant).retour?.quandMs !== avant)
      magasinActif().getState().setRappel(i, e.saisieLe, null);
  };

  const changerMarge = (min: number) => {
    if (!magasinActif().getState().setMargeRappel(min)) return;
    magasinActif()
      .getState()
      .enclos.forEach((e, i) => {
        if (e.rappel) magasinActif().getState().setRappel(i, e.saisieLe, null); /* l'heure du rappel change */
      });
  };

  /* Annule le rappel de l'enclos : un événement d'agenda reste à supprimer à la main (l'enclos s'en souvient
     dans `ancienRappel`). */
  const annulerRappelEnclos = (i: number) => void magasinActif().getState().setRappel(i, enclos[i].saisieLe, null);

  return (
    <Page>
      <EnTete titre="Mes enclos" actions={<BoutonDemo />}>
        En quittant un enclos, note la sérénité de chaque monture et le niveau des jauges : l&apos;outil te dit à quelle
        heure revenir. Le plus urgent est en haut.
      </EnTete>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <BellRing className="size-4 text-primary" aria-hidden />
          Me prévenir
        </span>
        <Choix
          label="Marge des rappels avant l'heure de retour"
          taille="sm"
          valeur={margeMin}
          onChange={changerMarge}
          options={MARGES_RAPPEL_MIN.map((m) => ({ valeur: m, label: m === 0 ? "à l’heure" : `${m} min` }))}
        />
        <span className="text-muted-foreground">avant l&apos;heure de retour.</span>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="annonce-enclos">
        {annonce}
      </p>

      {!pret ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {vues.map((v, rang) => (
            <EnclosCard
              key={v.index}
              enclos={enclos[v.index]}
              vue={v}
              maintenantMs={maintenant}
              premier={rang === 0}
              margeMin={margeMin}
              onObjectif={(o) => changerObjectif(v.index, o)}
              rappel={{
                demo,
                methode,
                methodes,
                onMethode: (m) => magasinActif().getState().setMethodeRappel(m),
                onAnnuler: () => annulerRappelEnclos(v.index),
                onProgramme: (m, at) => magasinActif().getState().setRappel(v.index, enclos[v.index].saisieLe, { methode: m, at }),
                onPermission: setPermission,
              }}
              onSave={(e) => sauver(v.index, e)}
              onClear={() => vider(v.index)}
              onAnnonce={setAnnonce}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
