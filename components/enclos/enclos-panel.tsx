"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnclosCard } from "@/components/enclos/enclos-card";
import { usePush } from "@/components/enclos/use-push";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatCompteARebours, remplacerEnclos, trierParUrgence, vueEnclos, type Objectif } from "@/lib/enclos";
import { enclosSchema, NB_ENCLOS, type Enclos } from "@/lib/schema";
import { annulerApi, enJson, planifierApi } from "@/lib/push/client";
import { contenuRappel } from "@/lib/push/rappel-enclos";
import { useStore } from "@/lib/store";

const TITRE = "Mes enclos";

export function EnclosPanel() {
  const [pret, setPret] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [objectifs, setObjectifs] = useState<Objectif[]>(() => Array(NB_ENCLOS).fill("aucun"));
  const enclos = useStore((s) => s.enclos);
  const push = usePush();
  /* Message propre à chaque enclos (succès / échec du rappel push) et opération en cours. */
  const [notes, setNotes] = useState<(string | null)[]>(() => Array(NB_ENCLOS).fill(null));
  const [enCours, setEnCours] = useState<boolean[]>(() => Array(NB_ENCLOS).fill(false));
  const noter = (i: number, n: string | null) => setNotes((p) => p.map((x, k) => (k === i ? n : x)));
  const occuper = (i: number, b: boolean) => setEnCours((p) => p.map((x, k) => (k === i ? b : x)));

  /* Le magasin n'est pas hydraté tout seul (skipHydration) : lecture du localStorage côté client. */
  useEffect(() => {
    const fin = useStore.persist.onFinishHydration(() => setPret(true));
    void useStore.persist.rehydrate();
    if (useStore.persist.hasHydrated()) setPret(true); // eslint-disable-line react-hooks/set-state-in-effect
    return fin;
  }, []);

  /* Horloge : on recalcule chaque seconde. */
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const vues = useMemo(
    () => trierParUrgence(enclos.map((e, i) => vueEnclos(e, i, maintenant, objectifs[i] ?? "aucun"))),
    [enclos, maintenant, objectifs],
  );

  /* Titre de l'onglet = compte à rebours du prochain événement. */
  const prochain = vues[0]?.retour ?? null;
  useEffect(() => {
    if (!pret) return;
    document.title = prochain
      ? `${formatCompteARebours((prochain.quandMs - maintenant) / 1000)} · ${enclos[vues[0].index].nom || `Enclos ${vues[0].index + 1}`} · ${TITRE}`
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

  /* ---------- rappels push (#16) ---------- */
  const annulerRappel = useCallback(
    async (e: Enclos) => {
      if (!e.rappel || !push.subscription) return;
      await annulerApi(e.rappel.messageId, push.subscription.endpoint);
    },
    [push.subscription],
  );

  const planifierRappel = useCallback(
    async (i: number, e: Enclos, objectif: Objectif, sub: PushSubscription | null = push.subscription) => {
      if (!sub || useStore.getState().futureVersion) return;
      const c = contenuRappel(e, i, objectif, Date.now());
      if (!c.ok) return noter(i, c.raison);
      occuper(i, true);
      const r = await planifierApi({ subscription: enJson(sub), at: c.at, titre: c.titre, corps: c.corps, url: c.url, enclos: i });
      occuper(i, false);
      if (!r.ok) return noter(i, `Notification non planifiée : ${r.erreur}`);
      /* Ressaisi pendant l'appel : ce rappel est déjà périmé, on l'annule. */
      if (!useStore.getState().setRappel(i, e.saisieLe, { messageId: r.data.messageId, at: r.data.at }))
        return void annulerApi(r.data.messageId, sub.endpoint);
      noter(i, null);
    },
    [push.subscription],
  );

  const sauver = (i: number, e: Enclos) => {
    const r = enclosSchema.safeParse({ ...e, rappel: null });
    if (!r.success) return;
    const ancien = useStore.getState().enclos[i];
    useStore.setState({ enclos: remplacerEnclos(useStore.getState().enclos, i, r.data) });
    noter(i, null);
    /* Ressaisie ou enclos vidé : l'ancien rappel est annulé, puis replanifié si cet appareil est abonné. */
    void annulerRappel(ancien);
    if (r.data.saisieLe !== null && push.etat.statut === "pret" && push.etat.abonne)
      void planifierRappel(i, r.data, objectifs[i] ?? "aucun");
  };
  const vider = (i: number) => sauver(i, enclosSchema.parse({ nom: enclos[i].nom }));

  const changerObjectif = (i: number, o: Objectif) => {
    setObjectifs((p) => p.map((x, k) => (k === i ? o : x)));
    /* L'objectif change l'heure de retour : on replanifie un rappel existant. */
    const e = enclos[i];
    if (e.rappel && useStore.getState().setRappel(i, e.saisieLe, null)) {
      void annulerRappel(e);
      void planifierRappel(i, { ...e, rappel: null }, o);
    }
  };

  const activerPush = async (i: number) => {
    const sub = push.subscription ?? (await push.activer());
    if (sub) await planifierRappel(i, enclos[i], objectifs[i] ?? "aucun", sub);
  };
  const annulerPush = (i: number) => {
    const e = enclos[i];
    if (useStore.getState().setRappel(i, e.saisieLe, null)) void annulerRappel(e);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
            ← Accueil
          </Link>
          <h1 className="text-2xl font-bold">Mes enclos</h1>
        </div>
        <ThemeToggle />
      </header>
      <p className="text-sm text-muted-foreground">
        En quittant un enclos, note la sérénité de chaque monture et le niveau des jauges : l&apos;outil te dit à
        quelle heure revenir. Les 6 enclos sont triés, le plus urgent en haut. Tout reste dans ce navigateur.
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
              objectif={objectifs[v.index] ?? "aucun"}
              onObjectif={(o) => changerObjectif(v.index, o)}
              push={{
                etat: push.etat,
                enCours: enCours[v.index] ?? false,
                note: notes[v.index] ?? null,
                onActiver: () => void activerPush(v.index),
                onAnnuler: () => annulerPush(v.index),
              }}
              onSave={(e) => sauver(v.index, e)}
              onClear={() => vider(v.index)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
