"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { EnclosCard, type Permission } from "@/components/enclos/enclos-card";
import { usePush } from "@/components/enclos/use-push";
import { magasinActif, useApp, useUi } from "@/components/app-state";
import { BoutonDemo } from "@/components/commun/bouton-demo";
import { Choix } from "@/components/commun/choix";
import { EnTete, Page } from "@/components/commun/en-tete";
import { annonceEnregistre, formatCompteARebours, trierParUrgence, vueEnclos, type Objectif } from "@/lib/enclos";
import { enclosSchema, MARGES_RAPPEL_MIN, NB_ENCLOS, type Enclos } from "@/lib/schema";
import { annulerApi, enJson, planifierApi } from "@/lib/push/client";
import { methodesDisponibles, phraseSansPush, type CapacitePush, type MethodeRappel } from "@/lib/rappel";
import { contenuRappel } from "@/lib/push/rappel-enclos";

const TITRE = "Mes enclos";

export function EnclosPanel() {
  const pret = useUi((u) => u.pret);
  const demo = useUi((u) => u.demo);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const enclos = useApp((s) => s.enclos);
  const margeMin = useApp((s) => s.reglages.margeRappelMin);
  const methode = useApp((s) => s.reglages.methodeRappel);
  const push = usePush();
  const [permission, setPermission] = useState<Permission>("default");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'API Notification n'existe que dans le navigateur
    setPermission(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
  }, []);
  /* Message propre à chaque enclos (succès / échec du rappel push) et opération en cours. */
  const [notes, setNotes] = useState<(string | null)[]>(() => Array(NB_ENCLOS).fill(null));
  const [enCours, setEnCours] = useState<boolean[]>(() => Array(NB_ENCLOS).fill(false));
  /* Annonce vocale polie : la région existe avant son contenu, pour que le lecteur d'écran la lise. */
  const [annonce, setAnnonce] = useState("");
  const noter = (i: number, n: string | null) => setNotes((p) => p.map((x, k) => (k === i ? n : x)));
  const occuper = (i: number, b: boolean) => setEnCours((p) => p.map((x, k) => (k === i ? b : x)));

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

  /* ---------- rappels push (#16) : jamais en démo ---------- */
  const annulerRappel = useCallback(
    async (e: Enclos) => {
      if (!e.rappel?.messageId || !push.subscription) return;
      await annulerApi(e.rappel.messageId, push.subscription.endpoint);
    },
    [push.subscription],
  );

  const planifierRappel = useCallback(
    async (i: number, e: Enclos, objectif: Objectif, sub: PushSubscription | null = push.subscription) => {
      const magasin = magasinActif().getState();
      if (!sub || magasin.demo || magasin.futureVersion) return null;
      const c = contenuRappel(e, i, objectif, Date.now(), magasin.reglages.margeRappelMin * 60);
      if (!c.ok) {
        noter(i, c.raison);
        return null;
      }
      occuper(i, true);
      const r = await planifierApi({ subscription: enJson(sub), at: c.at, titre: c.titre, corps: c.corps, url: c.url, enclos: i });
      occuper(i, false);
      if (!r.ok) {
        noter(i, `Notification non planifiée : ${r.erreur}`);
        return null;
      }
      /* Ressaisi pendant l'appel (ou passage en démo) : ce rappel est déjà périmé, on l'annule. */
      if (magasinActif().getState().demo || !magasinActif().getState().setRappel(i, e.saisieLe, { methode: "push", messageId: r.data.messageId, at: r.data.at })) {
        void annulerApi(r.data.messageId, sub.endpoint);
        return null;
      }
      noter(i, null);
      return r.data.at;
    },
    [push.subscription],
  );

  /* Le push se replanifie tout seul à la ressaisie seulement si c'est la méthode choisie sur cet appareil. */
  const capPush: CapacitePush =
    push.etat.statut === "pret" ? "pret" : push.etat.statut === "chargement" ? "chargement" : { indisponible: push.etat.raison };
  const methodes = methodesDisponibles({ push: capPush, notificationPage: permission !== "indisponible" && permission !== "denied" });
  const sansPush = phraseSansPush(capPush);

  const pushActif = !demo && methode === "push" && push.etat.statut === "pret" && push.etat.abonne;

  /* Replanifie un rappel déjà posé (objectif ou marge changés : l'heure d'envoi change). */
  const replanifier = (i: number) => {
    const e = magasinActif().getState().enclos[i];
    if (demo || e?.rappel?.methode !== "push" || !magasinActif().getState().setRappel(i, e.saisieLe, null)) return;
    void annulerRappel(e);
    void planifierRappel(i, { ...e, rappel: null }, e.objectif);
  };

  const sauver = (i: number, e: Enclos, annoncer = true) => {
    const magasin = magasinActif().getState();
    const ancien = magasin.enclos[i];
    /* l'objectif choisi reste celui de l'enclos, même après une nouvelle saisie */
    if (!magasin.setEnclos(i, { ...e, objectif: ancien.objectif })) return;
    noter(i, null);
    if (annoncer) {
      const nouveau = magasinActif().getState().enclos[i];
      const t = nouveau.saisieLe ?? maintenant;
      setAnnonce(annonceEnregistre(vueEnclos(nouveau, i, t), nouveau.nom || `Enclos ${i + 1}`, t));
    }
    if (demo) return;
    /* Ressaisie ou enclos vidé : l'ancien rappel est annulé, puis replanifié si cet appareil est abonné. */
    void annulerRappel(ancien);
    const nouveau = magasinActif().getState().enclos[i];
    if (nouveau.saisieLe !== null && pushActif) void planifierRappel(i, nouveau, nouveau.objectif);
  };
  const vider = (i: number) => {
    sauver(i, enclosSchema.parse({ nom: enclos[i].nom }), false);
    setAnnonce(`${enclos[i].nom || `Enclos ${i + 1}`} vidé.`);
  };

  const changerObjectif = (i: number, o: Objectif) => {
    const avant = vueEnclos(enclos[i], i, maintenant).retour?.quandMs;
    if (!magasinActif().getState().setObjectif(i, o)) return;
    replanifier(i);
    /* l'heure de retour a changé : le rappel d'agenda programmé ne vaut plus (l'ancien événement est à supprimer à la main) */
    const e = magasinActif().getState().enclos[i];
    if (e.rappel && e.rappel.methode !== "push" && vueEnclos(e, i, maintenant).retour?.quandMs !== avant)
      magasinActif().getState().setRappel(i, e.saisieLe, null);
  };

  const changerMarge = (min: number) => {
    if (!magasinActif().getState().setMargeRappel(min)) return;
    magasinActif()
      .getState()
      .enclos.forEach((e, i) => {
        if (e.rappel?.methode === "push") replanifier(i);
        else if (e.rappel) magasinActif().getState().setRappel(i, e.saisieLe, null); /* l'heure du rappel change */
      });
  };

  const activerPush = async (i: number) => {
    const sub = push.subscription ?? (await push.activer());
    const e = magasinActif().getState().enclos[i];
    return sub ? planifierRappel(i, e, e.objectif, sub) : null;
  };
  /* Choisir une autre méthode que le push annule la notification déjà planifiée pour cet enclos. */
  const choisirMethode = (i: number, m: MethodeRappel) => {
    magasinActif().getState().setMethodeRappel(m);
    if (m !== "push" && enclos[i].rappel?.methode === "push") annulerRappelEnclos(i);
  };
  /* Annule le rappel de l'enclos : le push est annulé côté serveur ; un événement d'agenda reste à supprimer
     à la main (l'enclos s'en souvient dans `ancienRappel`). */
  const annulerRappelEnclos = (i: number) => {
    const e = enclos[i];
    if (magasinActif().getState().setRappel(i, e.saisieLe, null)) void annulerRappel(e);
  };

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
                sansPush,
                enCours: enCours[v.index] ?? false,
                note: notes[v.index] ?? null,
                onMethode: (m) => choisirMethode(v.index, m),
                onPush: () => activerPush(v.index),
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
