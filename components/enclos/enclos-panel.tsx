"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { EnclosCard, type Permission } from "@/components/enclos/enclos-card";
import { usePush } from "@/components/enclos/use-push";
import { magasinActif, useApp, useUi } from "@/components/app-state";
import { BoutonDemo } from "@/components/commun/bouton-demo";
import { Choix } from "@/components/commun/choix";
import { EnTete, Page } from "@/components/commun/en-tete";
import { formatCompteARebours, trierParUrgence, vueEnclos, type Objectif } from "@/lib/enclos";
import { enclosSchema, MARGES_RAPPEL_MIN, NB_ENCLOS, type Enclos } from "@/lib/schema";
import { annulerApi, enJson, MESSAGES_INDISPO, planifierApi } from "@/lib/push/client";
import { contenuRappel } from "@/lib/push/rappel-enclos";

const TITRE = "Mes enclos";

export function EnclosPanel() {
  const pret = useUi((u) => u.pret);
  const demo = useUi((u) => u.demo);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const enclos = useApp((s) => s.enclos);
  const margeMin = useApp((s) => s.reglages.margeRappelMin);
  const push = usePush();
  const [permission, setPermission] = useState<Permission>("default");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'API Notification n'existe que dans le navigateur
    setPermission(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
  }, []);
  /* Message propre à chaque enclos (succès / échec du rappel push) et opération en cours. */
  const [notes, setNotes] = useState<(string | null)[]>(() => Array(NB_ENCLOS).fill(null));
  const [enCours, setEnCours] = useState<boolean[]>(() => Array(NB_ENCLOS).fill(false));
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
      if (!e.rappel || !push.subscription) return;
      await annulerApi(e.rappel.messageId, push.subscription.endpoint);
    },
    [push.subscription],
  );

  const planifierRappel = useCallback(
    async (i: number, e: Enclos, objectif: Objectif, sub: PushSubscription | null = push.subscription) => {
      const magasin = magasinActif().getState();
      if (!sub || magasin.demo || magasin.futureVersion) return;
      const c = contenuRappel(e, i, objectif, Date.now(), magasin.reglages.margeRappelMin * 60);
      if (!c.ok) return noter(i, c.raison);
      occuper(i, true);
      const r = await planifierApi({ subscription: enJson(sub), at: c.at, titre: c.titre, corps: c.corps, url: c.url, enclos: i });
      occuper(i, false);
      if (!r.ok) return noter(i, `Notification non planifiée : ${r.erreur}`);
      /* Ressaisi pendant l'appel (ou passage en démo) : ce rappel est déjà périmé, on l'annule. */
      if (magasinActif().getState().demo || !magasinActif().getState().setRappel(i, e.saisieLe, { messageId: r.data.messageId, at: r.data.at }))
        return void annulerApi(r.data.messageId, sub.endpoint);
      noter(i, null);
    },
    [push.subscription],
  );

  const pushActif = !demo && push.etat.statut === "pret" && push.etat.abonne;

  /* Replanifie un rappel déjà posé (objectif ou marge changés : l'heure d'envoi change). */
  const replanifier = (i: number) => {
    const e = magasinActif().getState().enclos[i];
    if (demo || !e?.rappel || !magasinActif().getState().setRappel(i, e.saisieLe, null)) return;
    void annulerRappel(e);
    void planifierRappel(i, { ...e, rappel: null }, e.objectif);
  };

  const sauver = (i: number, e: Enclos) => {
    const magasin = magasinActif().getState();
    const ancien = magasin.enclos[i];
    /* l'objectif choisi reste celui de l'enclos, même après une nouvelle saisie */
    if (!magasin.setEnclos(i, { ...e, objectif: ancien.objectif })) return;
    noter(i, null);
    if (demo) return;
    /* Ressaisie ou enclos vidé : l'ancien rappel est annulé, puis replanifié si cet appareil est abonné. */
    void annulerRappel(ancien);
    const nouveau = magasinActif().getState().enclos[i];
    if (nouveau.saisieLe !== null && pushActif) void planifierRappel(i, nouveau, nouveau.objectif);
  };
  const vider = (i: number) => sauver(i, enclosSchema.parse({ nom: enclos[i].nom }));

  const changerObjectif = (i: number, o: Objectif) => {
    if (magasinActif().getState().setObjectif(i, o)) replanifier(i);
  };

  const changerMarge = (min: number) => {
    if (!magasinActif().getState().setMargeRappel(min)) return;
    magasinActif()
      .getState()
      .enclos.forEach((e, i) => e.rappel && replanifier(i));
  };

  const activerPush = async (i: number) => {
    const sub = push.subscription ?? (await push.activer());
    const e = magasinActif().getState().enclos[i];
    if (sub) await planifierRappel(i, e, e.objectif, sub);
  };
  const annulerPush = (i: number) => {
    const e = enclos[i];
    if (magasinActif().getState().setRappel(i, e.saisieLe, null)) void annulerRappel(e);
  };

  return (
    <Page>
      <EnTete titre="Mes enclos" actions={<BoutonDemo />}>
        En quittant un enclos, note la sérénité de chaque monture et le niveau des jauges : l&apos;outil te dit à quelle
        heure revenir. Le plus urgent est en haut.
      </EnTete>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          <span className="text-muted-foreground">avant l&apos;heure de retour (agenda et notifications).</span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="aide-notifications">
          <p>
            « Me prévenir dans cet onglet » : seulement tant que l&apos;onglet reste ouvert (perdu au rechargement).
            {permission === "denied" && " Notifications bloquées par ton navigateur."}
            {permission === "indisponible" && " Les notifications ne sont pas disponibles sur ce navigateur."}
          </p>
          {demo ? (
            <p>Pas de notification en mode démo.</p>
          ) : push.etat.statut === "indisponible" ? (
            <p className="text-warning">
              {MESSAGES_INDISPO[push.etat.raison]} Utilise plutôt « Ajouter à mon agenda » : l&apos;alarme de ton agenda
              sonnera à l&apos;heure.
            </p>
          ) : push.etat.statut === "pret" ? (
            <p>
              {push.etat.abonne
                ? "Notifications activées sur cet appareil : chaque saisie planifie automatiquement son rappel."
                : "« Recevoir une notification sur ce téléphone » : tu seras prévenu à l’heure du rappel, même onglet fermé ou téléphone en poche."}
            </p>
          ) : null}
        </div>
      </div>

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
              push={{
                etat: push.etat,
                enCours: enCours[v.index] ?? false,
                note: notes[v.index] ?? null,
                demo,
                onActiver: () => void activerPush(v.index),
                onAnnuler: () => annulerPush(v.index),
                onPermission: setPermission,
              }}
              onSave={(e) => sauver(v.index, e)}
              onClear={() => vider(v.index)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
